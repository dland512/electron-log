var fs               = require('fs');
var path             = require('path');
var ARCHIVE_SEP      = '__';
var consoleTransport = require('../console');


module.exports = {
  archiveFile: archiveFile,
  rollAwayOldLogs: rollAwayOldLogs
};


function logConsole(message, error) {
  var data = ['electron-log.transports.file: ' + message];

  if (error) {
    data.push(error);
  }

  consoleTransport({ data: data, date: new Date(), level: 'warn' });
}

/*
 * Renames a file using a special time stamp that designates as an archived log file.
 */
function archiveFile(stream) {
  var archiveTime = getArchiveDateTime();
  var archiveMarker = ARCHIVE_SEP + archiveTime + '.log';
  var newName = stream.path.replace(/\.log$/, archiveMarker);
  fs.renameSync(stream.path, newName);
}

/*
 * Returns a string consisting of the current date and time down to the second. All numbers are padded with zeros
 * to give them a consistent width, e.g. 20170802_093306
 */
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

/*
 * Pads a string or number with 0s up to a given length, e.g.
 *    padZeros(2, 2) = '02'
 *    padZeros(22, 2) = '22'
 */
function padZeros(str, len) {
  str = str.toString(); // in case it's a number

  if (str.length < len) {
    var zeros = "0".repeat(len);
    return (zeros + str).substr(-len, len);
  }
  else {
    // not short enough to pad so return unmodified
    return str;
  }
}

/*
 * Deletes old archived log files if there are more than the configuration dictates. For example, if the config says
 * there should be a maximum of 5 archived log files and there are 7, the oldest two will be deleted.
 */
function rollAwayOldLogs(stream) {
  var fileData = getArchivedLogs(stream);
  logConsole('fileData:', fileData);

  // remove the oldest n files
  deleteAgedOutFiles(fileData, 5);
}

/*
 * Gets the a list of the archived log files in log directory.
 */
function getArchivedLogs(stream) {
  var baseFileName = path.basename(stream.path);
  var dir = path.dirname(stream.path);

  var files = fs.readdirSync(dir);
  var fileData = [];

  logConsole(baseFileName);

  // create a list of objects that map file name to date archived
  for (var i = 0; i < files.length; i++) {
    var file = files[i];

    var withoutExt = baseFileName.split('.')[0];
    var toTest = withoutExt + ARCHIVE_SEP;

    logConsole('testing ' + file);

    // should match <path>__<8 digits>_<6 digits>.log (e.g. mylog__20170822_202322.log)
    var re = new RegExp(toTest + '\\d{8}_\\d{6}\.log');

    if (file.match(re)) {
      logConsole('...........match!', file);
      var fullPath = path.join(dir, file);
      var stats = fs.statSync(fullPath);

      if (stats.isFile()) {
        var d = extractDateFromFile(file);
        fileData.push({ file: fullPath, date: d });
      }
    }
  }

  return fileData;
}

/*
 * Extracts the date/time string from an archived log file's name.
 */
function extractDateFromFile(file) {
  // split around the __, which separates the log file name from the date/time info
  var parts = file.split(ARCHIVE_SEP);

  if (parts.length == 2) {
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

/*
 * Deletes the archived
 */
function deleteAgedOutFiles(fileData, maxFiles) {
  var agedOutFiles = getAgedOutFiles(fileData, maxFiles);

  // delete the latest n files that are past the date
  for (var i = maxFiles; i < fileData.length; i++) {
    fs.unlinkSync(fileData[i].file);
  }
}

/*
 * Take a list of files and if there are more than a certain number of them, return the oldest ones beyond that
 * number. For example, if there are 7 files and maxFiles = 5, return the 2 oldest files.
 */
function getAgedOutFiles(files, maxFiles) {
  var agedOutFiles = [];

  // sort by oldest first
  files.sort(sortNewestFirst);

  // return the oldest files
  for (var i = maxFiles; i < files.length; i++) {
    var fileName = files[i].file;
    logConsole('deleting ', fileName);
    agedOutFiles.push(files[i]);
  }
}

/*
 * Sorts a list of archived log files, newest first.
 */
function sortNewestFirst(a, b) {
  if (a.date >= b.date) {
    return -1;
  }

  if (a.date <= b.date) {
    return 1;
  }

  return 0;
}
