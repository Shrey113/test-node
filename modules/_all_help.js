const fs = require('fs');
const path = require('path');
const chalk = require('chalk')


function error_message(message,error=""){
  console.log(chalk.red(` [ERROR]   ${message}`));
  if (!error==""){
    console.log(error);
  }
}

function info_message(message){
  console.log(chalk.hex('#fffd94')(` [INFO]    ${message}`));
}

function success_message(message){
  console.log(chalk.green(` [SUCCESS] ${message}`));
}

function normal_message(message){
  console.log(chalk.white(` [NORMAL]  ${message}`));
}



const log_file_path = path.join(__dirname, './../../Data_file/log_file.txt');

function write_log_file(message, status = 'INFO') {
  const current_time = new Date();
  const formatted_time = current_time.toLocaleString('en-GB', { hour12: false });

  const log_entry = `\nDate      :  ${formatted_time}\n` +
                      `Status    :  ${status}\n` +
                      `Message   :  ${message}\n`;

  fs.appendFile(log_file_path, log_entry, (err) => {
    if (err) {
      error_message(`Error writing to log`)
      error_message(`Error :\n`,err);
      return;
    }
    success_message('Log entry added successfully')
  });
}

module.exports = {write_log_file,error_message,info_message,success_message,normal_message}