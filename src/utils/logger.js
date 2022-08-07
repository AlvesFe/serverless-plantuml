module.exports = function logger(message, type = 'info') {
  const colors = {
    info: '\x1b[33m',
    error: '\x1b[31m',
    warning: '\x1b[35m',
    debug: '\x1b[36m'
  }
  console.log('Serverless PlantUml: ', colors[type] + message + '\x1b[0m')
}