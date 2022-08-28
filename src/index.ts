import AWS from 'aws-sdk'
import fs from 'fs'
import _ from 'lodash'
import logger from './utils/logger'
import template from './templates/pumlTemplate'
import PlantumlService from './service/plantuml.service'
import { Options, Service } from './types/serverless'
import { relationTypes, resourceType, plantUmlResource } from './types/plantUml'
import Case from 'case'


const IS_DEBUG = Boolean(process.env.SLS_DEBUG)

class PlantUml {
  serverless: any
  hooks: Record<string, Function>

  constructor(serverless) {
    this.serverless = serverless
    this.hooks = {
      'before:offline:start': async () => await this.initialize(false),
      'before:deploy:deploy': async () => await this.initialize(true)
    }
  }

  async initialize(deployToS3: boolean = false): Promise<void> {
    try {
      logger('Generating diagram...')
      const { functions, custom, resources } = this.serverless.configurationInput
      const { stage } = this.serverless.service.provider
      const serviceName = this.serverless.service.service
      const options: Options = {
        path: custom?.plantUml?.path
          ? custom.plantUml.path.replace(/^\/|\/$/g, '')
          : '',
        name: custom?.plantUml?.name || serviceName,
        s3Bucket: custom?.plantUml?.s3Bucket,
        s3Path: custom.plantUml.s3Path
          ? custom?.plantUml?.s3Path?.replace(/^\/|\/$/g, '')
          : ''
      }

      const items = this.generateResources({
        serviceName,
        functions,
        resources,
        stage
      })
      const diagram = this.createDiagram(items, options)
      this.saveDiagram(diagram, options)
      if (deployToS3 && options.s3Bucket) await this.putS3(diagram, options)
    } catch (error) {
      IS_DEBUG && console.error(error, '\n')
      logger('Could not generate diagram', 'error')
    }
  }

  createDiagram(items: string, options: Options): string {
    const { autoGenStart, autoGenEnd } = template
    let oldDiagram: string
    try {
      oldDiagram = fs.readFileSync(`./${options.path}/diagram.puml`, 'utf8')
    } catch (error) {
      logger('Could not read old diagram, creating new one', 'warning')
    }

    if (!oldDiagram) return this.writeDiagram(options.name, items)

    const oldDiagramManualSection = oldDiagram.split(autoGenEnd)[1].split(autoGenStart)[0]
    return this.writeDiagram(options.name, items, oldDiagramManualSection)
  }

  writeDiagram(diagramName: string, autoGenBody: string, manualBody?: string): string {
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

  generateResources(service: Service): string {
    const functionNames = service?.functions ? Object.keys(service.functions) : []
    const resourceNames = service?.resources?.Resources ? Object.keys(service.resources.Resources) : []
    const plantUmlService = new PlantumlService(service.serviceName, service.stage, IS_DEBUG)

    const lambdas = functionNames.map((lambda) =>
      plantUmlService.resourceBuilder(service.functions[lambda], lambda, resourceType.Function)
    )

    const resources = resourceNames.map((resource): string | null => {
      try {
        const _resource = service.resources.Resources[resource]
        if (!_resource) return null
        const type = plantUmlService.getResourceType(_resource, resourceType.Resource)
        const prefix = plantUmlResource[type]
        const resourceName = plantUmlService
          .getItemLabel(_resource, prefix, resource)
          .replace(`-${service.stage}`, '')
          .replace(/(-)./g, s => s.slice(-1).toUpperCase())
        return plantUmlService.resourceBuilder(_resource, resourceName, resourceType.Resource)
      } catch (error) {
        IS_DEBUG && console.error(error, '\n')
        logger(`Could not build resource ${resource}`, 'warning')
        return null
      }
    })

    const events = functionNames.map((lambda): string | null => {
      const event = service.functions[lambda]?.events[0]
      if (!event) return null
      const key = Object.keys(event)[0]
      if (key === 'http') return plantUmlService.resourceBuilder(event, 'http', resourceType.Event)
      if (typeof event[key] === 'string' || typeof event[key]?.arn === 'string') {
        const arn = event[key]?.arn || event[key]
        const eventName = arn.split(':').pop().split('-')[0]
        return plantUmlService.resourceBuilder(event, eventName, resourceType.Event)
      }
      return null
    })

    const eventRelations = functionNames.map((lambda): string | null => {
      try {
        const event = service.functions[lambda]?.events[0]
        if (!event) return null
        const key = Object.keys(event)[0]
        let eventName = ''
        if (key === 'http') { return plantUmlService.relationBuilder(event, 'http', lambda, relationTypes.Events) }
        if (typeof event[key] === 'string' || typeof event[key]?.arn === 'string') {
          const arn = event[key]?.arn || event[key]
          eventName = arn.split(':').pop().split('-')[0]
          return plantUmlService.relationBuilder(event, eventName, lambda, relationTypes.Events)
        }
        if (!service?.resources?.Resources) return null
        const resourceName = event[key]?.arn['Fn::GetAtt'][0]
        const resource = service.resources.Resources[resourceName]
        const type = plantUmlService.getResourceType(resource, resourceType.Resource)
        const prefix = plantUmlResource[type]
        const _eventName = plantUmlService
          .getItemLabel(resource, prefix, resourceName)
          .replace(`-${service.stage}`, '')
        eventName = Case.camel(_eventName)
        return plantUmlService.relationBuilder(event, eventName, lambda, relationTypes.Events)
      } catch (error) {
        IS_DEBUG && console.error(error, '\n')
        logger(`Could not build relation for lambda ${lambda}`, 'warning')
        return null
      }
    })

    const items = _.concat(lambdas, resources, events, eventRelations)
    return _.uniq(items).filter(Boolean).join('\n')
  }

  saveDiagram(diagram: string, options: Options): void {
    const { path } = options
    fs.writeFile(`./${path}/diagram.puml`, diagram, (err) => {
      if (err) return logger(`Could not save diagram: ${err.message}`, 'error')
      logger(`Diagram created at ${path}/diagram.puml`)
    })
  }

  async putS3(diagram: string, options: Options): Promise<void> {
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
      logger(`Could not upload diagram: ${String(error)}`, 'error')
    }
  }
}

export default PlantUml
