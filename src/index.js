const AWS = require('aws-sdk')
const fs = require('fs')
const logger = require('./utils/logger')
const caseConverter = require('serverless-plantuml/src/utils/caseConverter')
const template = require('./templates/template.json')
const IS_DEBUG = Boolean(process.env.SLS_DEBUG)

class PlantUml {
  constructor(serverless) {
    this.serverless = serverless
    this.hooks = {
      'before:offline:start': async () => await this.initialize(),
      'before:deploy:deploy': async () => await this.initialize(true)
    }
  }

  async initialize(deployToS3 = false) {
    logger('Generating diagram...')
    const { functions, custom, resources } = this.serverless.configurationInput
    const serviceName = this.serverless.service.service
    const stage = this.serverless.service.provider.stage
    const options = {
      path: custom?.plantUml?.path.replace(/^\/|\/$/g, '') || '',
      name: custom?.plantUml?.name || serviceName,
      s3Bucket: custom?.plantUml?.s3Bucket,
      s3Path: custom?.plantUml?.s3Path?.replace(/^\/|\/$/g, '') || ''
    }

    const items = this.generateResources({
      serviceName,
      functions,
      resources,
      stage
    }, options)
    const diagram = this.createDiagram(items, options)
    this.saveDiagram(diagram, options)
    if (deployToS3 && options.s3Bucket) await this.putS3(diagram, options)
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
    let lambdas, resources, relations
    const functionNames = Object.keys(service.functions)
    const resourceNames = Object.keys(service.resources.Resources)

    try {
      lambdas = functionNames.reduce((acc, key) => {
        const camelCaseName = caseConverter(service.serviceName, 'kebab', 'camel')
          + caseConverter(key, 'camel', 'pascal')
        const lambda = `Lambda(${camelCaseName}, "${service.serviceName}_${key}", "Lambda function")`
        return `${acc}${lambda}\n`
      }, '')
    } catch (error) {
      console.log(error);
      IS_DEBUG && logger(error, 'debug')
      logger('Could not process lambdas, skipping', 'warning')
    }

    try {
      resources = resourceNames.reduce((acc, key) => {
        const resource = this.resourceTranslator(service.resources.Resources[key], key, service.stage)
        return resource ? `${acc}${resource}\n` : acc
      }, '')

      const events = functionNames.reduce((acc, key) => {
        const event = this.eventTranslator(service.functions[key].events[0])
        return event ? `${acc}${event}\n` : acc
      }, '')

      const hasApiGateway = functionNames.some(key => Object.keys(service.functions[key].events[0])[0] === 'http')
      if (hasApiGateway) {
        const pascalCaseName = caseConverter(service.serviceName, 'kebab', 'pascal')
        resources += `APIGateway(${service.stage}${pascalCaseName}, "${service.stage}-${service.serviceName}", "API Gateway")\n`
      }
      resources += events
    } catch (error) {
      IS_DEBUG && logger(error, 'debug')
      logger('Could not process resources, skipping', 'warning')
    }

    try {
      relations = functionNames.reduce((acc, key) => {
        const lambda = caseConverter(service.serviceName, 'kebab', 'camel')
          + caseConverter(key, 'camel', 'pascal')
        const relation = this.relationTranslator(service.functions[key].events[0], lambda, service)
        return relation ? `${acc}${relation}\n` : acc
      }, '')
    }
    catch (error) {
      IS_DEBUG && logger(error, 'debug')
      logger('Could not process relations, skipping', 'warning')
    }

    return [lambdas, resources, relations].filter(Boolean).join('\n')
  }

  relationTranslator(event, lambda, service) {
    if (!event) return null
    const { serviceName, stage } = service
    const pascalCaseName = caseConverter(serviceName, 'kebab', 'pascal')
    const pascalStage = caseConverter(stage, 'camel', 'pascal')
    switch (Object.keys(event)[0]) {
      case 'http':
        return `Rel(${stage}${pascalCaseName}, ${lambda}, "${event.http.method.toUpperCase()} ${event.http.path}", "HTTP")`
      case 'sqs':
        const queueName = typeof event.sqs === 'string' ?
          caseConverter(event.sqs.split(':').pop(), 'kebab', 'camel') :
          `${event.sqs.arn['Fn::GetAtt'][0]}${pascalStage}`
        return `Rel(${queueName}, ${lambda}, "Subscriber", "SQS")`
      default:
        return null
    }
  }


  eventTranslator(event) {
    if (!event) return null
    switch (Object.keys(event)[0]) {
      case 'sqs':
        if (typeof event.sqs !== 'string') return null
        const queueName = event.sqs.split(':').pop()
        const camelCaseName = caseConverter(queueName, 'kebab', 'camel')
        return `SimpleQueueService(${camelCaseName}, "${queueName}", "SQS")`
      case 'http':
        return null
      default:
        IS_DEBUG && logger(`Event (${Object.keys(event)[0]}) not mapped, skipping`, 'debug')
        return null
    }
  }

  resourceTranslator(resource, key, stage) {
    const pascalStage = caseConverter(stage, 'camel', 'pascal')
    const { Type, Properties } = resource
    const resourceName = key + pascalStage
    switch (Type) {
      case 'AWS::DynamoDB::Table':
        return `DynamoDB(${resourceName}, "${Properties.TableName}", "DynamoDB")`
      case 'AWS::SNS::Topic':
        return `SimpleNotificationService(${resourceName}, "${Properties.TopicName}", "SNS")`
      case 'AWS::SQS::Queue':
        return `SimpleQueueService(${resourceName}, "${Properties.QueueName}", "SQS")`
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

  async putS3(diagram, options) {
    const { name, s3Bucket, s3Path } = options
    const s3 = new AWS.S3()
    const params = {
      Bucket: s3Bucket,
      Key: s3Path ? `${s3Path}/${name}.puml` : `${name}.puml`,
      Body: diagram
    }

    try {
      await s3.putObject(params).promise()
      logger(`Diagram uploaded to s3://${params.Bucket}/${params.Key}`)
    } catch (error) {
      logger(`Could not upload diagram: ${error}`, 'error')
    }
  }
}

module.exports = PlantUml
