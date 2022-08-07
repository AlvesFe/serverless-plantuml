const fs = require('fs')
const logger = require('./utils/logger')
const template = require('./templates/template.json')
const IS_DEBUG = process.env.SLS_DEBUG ? true : false

class PlantUml {
  constructor(serverless) {
    this.serverless = serverless
    this.hooks = {
      initialize: () => this.initialize()
    }
  }

  initialize() {
    logger('Generating diagram...')
    const { functions, custom, resources } = this.serverless.configurationInput
    const serviceName = this.serverless.service.service
    const stage = this.serverless.service.provider.stage
    const options = {
      path: custom.plantUml.path.replace(/^\/|\/$/g, ''),
      name: custom?.plantUml?.name || serviceName
    }

    const items = this.generateResources({
      serviceName,
      functions,
      resources,
      stage
    }, options)
    const diagram = this.createDiagram(items, options)
    this.saveDiagram(diagram, options)
  }

  createDiagram(items, options) {
    const { autoGenStart, autoGenEnd } = template
    let oldDiagram
    try {
      oldDiagram = fs.readFileSync(`./${options.path}/diagram.puml`, 'utf8')
    } catch (error) {
      logger('Could not read old diagram, creating new one', 'warning')
    }

    if (!oldDiagram) return this.writeDiagram(options.name, items)

    const oldDiagramManualSection = oldDiagram.split(autoGenEnd)[1].split(autoGenStart)[0]
    return this.writeDiagram(options.name, items, oldDiagramManualSection)
  }

  writeDiagram(diagramName, autoGenBody, manualBody) {
    const { header, footer, imports, autoGenStart, autoGenEnd, editHere } = template
    const start = `${header} ${diagramName}\n\n${imports.join('\n')}\n`
    const end = `\n${footer}\n`
    const center = [autoGenEnd, manualBody || editHere, autoGenStart].join('')
    const diagram = [
      autoGenStart,
      start,
      autoGenBody,
      center,
      end,
      autoGenEnd
    ].join('\n')
    return diagram
  }

  generateResources(service) {
    let lambdas, resources
    try {
      lambdas = Object.keys(service.functions).reduce((acc, key) => {
        const camelCaseName = service.serviceName
          .replace(/-([a-z])/g, g => g[1].toUpperCase()) + key
            .charAt(0).toUpperCase() + key.slice(1)
        const kebabServiceName = service.serviceName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
        const lambda = `Lambda(${camelCaseName}, "${kebabServiceName}_${key}", "Lambda function")`
        return acc + lambda + '\n'
      }, '')
    } catch (error) {
      IS_DEBUG && logger(error, 'debug')
      logger('Could not process lambdas, skipping', 'warning')
    }

    try {
      resources = Object.keys(service.resources.Resources).reduce((acc, key) => {
        const resource = this.resourceTranslator(service.resources.Resources[key], service.stage)
        return resource ? acc + resource + '\n' : acc
      }, '')
    } catch (error) {
      IS_DEBUG && logger(error, 'debug')
      logger('Could not process resources, skipping', 'warning')
    }
    return [lambdas, resources].filter(Boolean).join('\n')
  }

  resourceTranslator(resource, stage) {
    const { Type, Properties } = resource
    switch (Type) {
      case 'AWS::DynamoDB::Table':
        const tableName = Properties.TableName.replace(`-${stage}`, '')
        const camelCaseTableName = tableName.replace(/-([a-z])/g, g => g[1].toUpperCase())
        return `DynamoDB(${camelCaseTableName}, "${tableName}", "DynamoDB")`
      case 'AWS::SNS::Topic':
        const topicName = Properties.TopicName.replace(`-${stage}`, '')
        const camelCaseTopicName = topicName.replace(/-([a-z])/g, g => g[1].toUpperCase())
        return `SimpleNotificationService(${camelCaseTopicName}, "${topicName}", "SNS")`
      case 'AWS::SQS::Queue':
        const queueName = Properties.QueueName.replace(`-${stage}`, '')
        const camelCaseQueueName = queueName.replace(/-([a-z])/g, g => g[1].toUpperCase())
        return `SimpleQueueService(${camelCaseQueueName}, "${queueName}", "SQS")`
      default:
        IS_DEBUG && logger(`Resource (${Type}) not mapped, skipping`, 'debug')
        return null
    }
  }

  saveDiagram(diagram, options) {
    const { path } = options
    fs.writeFile(`./${path}/diagram.puml`, diagram, (err) => {
      if (err) return logger('Could not save diagram: ' + err, 'error')
      logger(`Diagram created at ${path}/diagram.puml`)
    })
  }
}

module.exports = PlantUml
