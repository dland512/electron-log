'use strict';

var fs               = require('fs');
var path             = require('path');
var EOL              = require('os').EOL;
var format           = require('../../format');
var consoleTransport = require('../console');
var findLogPath      = require('./find-log-path');
var ARCHIVE_SEP      = '__';

transport.findLogPath  = findLogPath;
transport.format       = formatFn;
transport.level        = 'warn';
transport.maxSize      = 1024 * 1024;
transport.streamConfig = undefined;

module.exports = transport;

function transport(msg) {
  var text = format.format(msg, transport.format) + EOL;

  if (transport.stream === undefined) {
    initSteamConfig();
    openStream();
  }

  if (transport.level === false) {
    return;
  }

  var needLogRotation = transport.maxSize > 0 &&
    getStreamSize(transport.stream) > transport.maxSize;

  if (needLogRotation) {
    archiveLog(transport.stream);
    openStream();
  }

  transport.stream.write(text);
}

function initSteamConfig() {
  transport.file = transport.file || findLogPath(transport.appName);

  if (!transport.file) {
    transport.level = false;
    logConsole('Could not set a log file');
  }
}

function openStream() {
  if (transport.level === false) {
    return;
  }

  transport.stream = fs.createWriteStream(
    transport.file,
    transport.streamConfig || { flags: 'a' }
  );
}

function getStreamSize(stream) {
  if (!stream) {
    return 0;
  }

  if (stream.logSizeAtStart === undefined) {
    try {
      stream.logSizeAtStart = fs.statSync(stream.path).size;
    } catch (e) {
      stream.logSizeAtStart = 0;
    }
  }

  return stream.logSizeAtStart + stream.bytesWritten;
}

function archiveLog(stream) {
  if (stream.end) {
    stream.end();
  }

  try {
    // format of archive file name is filename__20170720_152308.log, where single digits are padding with a zero
    archiveFile(stream);

    // delete files, oldest first, if surpassed max number allowed
    rollAwayOldLogs(stream);
    } catch (e) {
      logConsole('Could not rotate log', e);
  }
}

function formatFn(msg) {
  var date =
    msg.date.getFullYear() + '-' +
    format.pad(msg.date.getMonth() + 1) + '-' +
    format.pad(msg.date.getDate()) + ' ' +
    format.pad(msg.date.getHours()) + ':' +
    format.pad(msg.date.getMinutes()) + ':' +
    format.pad(msg.date.getSeconds()) + ':' +
    format.pad(msg.date.getMilliseconds(), 4);

  return '[' + date + '] [' + msg.level + '] ' +
    format.stringifyArray(msg.data);
}

function logConsole(message, error) {
  var data = ['electron-log.transports.file: ' + message];

  if (error) {
    data.push(error);
  }

  consoleTransport({ data: data, date: new Date(), level: 'warn' });
}

function archiveFile(stream) {
  var archiveTime = getArchiveDateTime();
  var archiveMarker = ARCHIVE_SEP + archiveTime + '.log';
  var newName = stream.path.replace(/\.log$/, archiveMarker);
  fs.renameSync(stream.path, newName);
}

function getArchiveDateTime() {
  var now = new Date();
  return '' +
    now.getUTCFullYear() +
    padZeros(now.getUTCMonth() + 1, 2) +
    padZeros(now.getUTCDate(), 2) + '_' +
    padZeros(now.getUTCHours(), 2) +
    padZeros(now.getUTCMinutes(), 2) +
    padZeros(now.getUTCSeconds(), 2);
}

function padZeros(str, num) {
  str = str.toString(); // in case it's a number

  if (str.length < num) {
    var zeros = "0".repeat(num);
    return (zeros + str).substr(-num, num);
  }
  else {
    // not short enough to pad so return unmodified
    return str;
  }
}

function rollAwayOldLogs(stream) {
  var fileData = getOldLogFiles(stream);
  logConsole('fileData:', fileData);

  // remove the oldest n files
  deleteAgedOutFiles(fileData, 5);
}

function getOldLogFiles(stream) {
  var baseFileName = path.basename(stream.path);
  var dir = path.dirname(stream.path);

  var files = fs.readdirSync(dir);
  var fileData = [];

  logConsole(baseFileName);

  // create a list of objects that map file name to date archived
  for(var i = 0; i < files.length; i++) {
    var file = files[i];

    var withoutExt = baseFileName.split('.')[0];
    var re = new RegExp();

    logConsole('comparing ' + file + ' to ' + withoutExt + ARCHIVE_SEP);

    if (file.startsWith(withoutExt + ARCHIVE_SEP)) {
      logConsole('match:', file);
      var fullPath = path.join(dir, file);
      var stats = fs.statSync(fullPath);

      if (stats.isFile()) {
        var d = extractDateFromFile(file);
        fileData.push({ file: fullPath, date: d });
      }
    }
  }
}

function extractDateFromFile(file) {
  // split around the __, which separates the log file name from the date/time info
  var parts = file.split(ARCHIVE_SEP);

  if(parts.length == 2) {
    var dateStr = parts[1];

    // extract all the date time values
    var year = dateStr.substr(0, 4);
    var month = dateStr.substr(4, 2);
    var date = dateStr.substr(6, 2);
    var hours = dateStr.substr(9, 2);
    var minutes = dateStr.substr(11, 2);
    var seconds = dateStr.substr(13, 2);

    return new Date(year, month, date, hours, minutes, seconds);
  }
}

function sortNewestFirst(a, b) {
  if (a.date >= b.date) {
    return -1;
  }

  if (a.date <= b.date) {
    return 1;
  }

  return 0;
}

function deleteAgedOutFiles(fileData, maxFiles) {
  // sort by oldest first
  fileData.sort(sortNewestFirst);

  // delete the latest n files that are past the date
  for (var i = maxFiles; i < fileData.length; i++) {
    var fileName = fileData[i].file;
    logConsole('deleting ', fileName);
    fs.unlinkSync(fileName);
  }
}
