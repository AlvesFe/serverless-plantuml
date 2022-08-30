import { logType } from '../types/logger'

const PREFIX = 'Serverless PlantUml: '

export default (message: string, type: logType = 'info'): void => {
  const colors = {
    info: '\x1b[33m',
    error: '\x1b[31m',
    warning: '\x1b[35m',
    debug: '\x1b[36m'
  }
  console.log(PREFIX, colors[type] + message + '\x1b[0m')
}