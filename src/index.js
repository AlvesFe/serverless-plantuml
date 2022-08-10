const AWS = require('aws-sdk')
const fs = require('fs')
const _ = require('lodash')
const logger = require('./utils/logger')
const template = require('./templates/template.json')
const PlantumlService = require('./service/plantuml.service')
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
    const functionNames = Object.keys(service?.functions) || []
    const resourceNames = Object.keys(service?.resources?.Resources) || []
    const plantUmlService = new PlantumlService(service.serviceName, service.stage, IS_DEBUG)
    const lambdas = functionNames.map((lambda) =>
      plantUmlService.resourceBuilder(service.functions[lambda], lambda, 'function')
    )
    const resources = resourceNames.map((resource) =>
      plantUmlService.resourceBuilder(service.resources.Resources[resource], resource, 'resource')
    )
    const events = functionNames.map((lambda) => {
      const event = service.functions[lambda]?.events[0]
      const key = Object.keys(event)[0]
      if (key === 'http')
        return plantUmlService.resourceBuilder(event, 'http', 'event')
      if (typeof event[key] === 'string') {
        const eventName = event[key]?.split(':').pop().split('-')[0]
        return plantUmlService.resourceBuilder(event, eventName, 'event')
      }
    })
    const eventRelations = functionNames.map((lambda) => {
      const event = service.functions[lambda]?.events[0]
      const key = Object.keys(event)[0]
      let eventName = ''
      if (key === 'http')
        return plantUmlService.relationBuilder(event, 'http', lambda, 'events')
      if (typeof event[key] === 'string') {
        eventName = event[key]?.split(':').pop().split('-')[0]
        return plantUmlService.relationBuilder(event, eventName, lambda, 'events')
      }

      const resourceName = event[key]?.arn['Fn::GetAtt'][0]
      const resource = service.resources.Resources[resourceName]
      const resourceType = plantUmlService.getResourceType(resource, 'resource')
      const prefix = plantUmlService.getPrefix(resourceType, resourceType)
      eventName = plantUmlService
        .getItemLabel(resource, prefix, resourceName)
        .replace(`-${service.stage}`, '')
      return plantUmlService.relationBuilder(event, eventName, lambda, 'events')
    })

    const items = _.concat(lambdas, resources, events, eventRelations)
    return _.uniq(items).filter(Boolean).join('\n')
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
