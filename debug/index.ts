process.env.SLS_DEBUG = '*'
import * as fs from 'fs'
import PlantUml from '../src'
import minimist from 'minimist'
const argv = minimist(process.argv.slice(2))

const upload = (argv.u || argv.upload) ?? false
const serverlessFile = fs.readFileSync('./data/serverlessFile.json').toString()
const payload = JSON.parse(serverlessFile)
const puml = new PlantUml(payload)

puml.initialize(upload).then(() => console.log('EXECUTED'))
