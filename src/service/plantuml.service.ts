import logger from '../utils/logger'
import { CloudFormationResource, AwsFunction, Event } from 'serverless/aws'
import { resourceType, relationTypes, plantUmlResource, plantUmlDefinition } from '../types/plantUml'
import Case from 'case'

class PlantUmlService {
  IS_DEBUG: boolean
  serviceName: Record<string, string>
  stage: Record<string, string>

  constructor(serviceName: string, stage: string, debug: boolean) {
    this.IS_DEBUG = debug
    this.serviceName = {
      default: serviceName,
      camelCase: Case.camel(serviceName),
      pascalCase: Case.pascal(serviceName)
    }
    this.stage = {
      default: stage,
      capitalized: Case.capital(stage),
      lowercased: stage.toLowerCase()
    }
  }

  resourceBuilder(
    resource: CloudFormationResource | AwsFunction | Event,
    resourceName: string,
    type: resourceType
  ): string | null {
    try {
      const resourceType = this.getResourceType(resource, type)
      const prefix = plantUmlResource[resourceType]
      const itemName = this.getItemName(resourceName, prefix)
      const itemLabel = this.getItemLabel(resource, prefix, resourceName)
      const definition = plantUmlDefinition[prefix]
      return `${prefix}(${itemName}, "${itemLabel}", "${definition}")`
    } catch (error) {
      this.IS_DEBUG && console.error(error)
      logger(`Could not build resource '${resourceName}'`, 'warning')
      return null
    }
  }

  relationBuilder(
    resource: Event | CloudFormationResource,
    resourceName: string,
    receiverName: string,
    relationType: relationTypes
  ): string | null {
    try {
      const typeGroups = {
        events: [resourceType.Event, resourceType.Function],
        resources: [resourceType.Resource, resourceType.Resource]
      }
      const types = typeGroups[relationType]
      if (!types) throw new Error(`Relation type '${relationType}' not mapped`)
      const actors = this.getActors(resource, resourceName, types, receiverName)
      const eventName = this.getRelationEvent(resource, types[0])
      const relationMethod = this.getRelationMethod(resource, types[0])
      return `Rel(${actors}, "${eventName}", "${relationMethod}")`
    } catch (error) {
      this.IS_DEBUG && console.error(error)
      logger(`Could not build relation '${resourceName}'`, 'warning')
      return null
    }
  }

  getRelationMethod(
    resource: CloudFormationResource | Event,
    type: resourceType
  ): string {
    const events = {
      event: Object.keys(resource)[0],
      resource: resource['Type']?.split('::')[1].toLowerCase()
    }
    const event = events[type]
    const relationMethods = {
      sqs: 'SQS',
      http: 'HTTP',
      sns: 'SNS'
    }
    if (!relationMethods[event]) throw new Error(`Relation method '${event}' not mapped`)
    return relationMethods[event]
  }

  getRelationEvent(
    resource: CloudFormationResource | Event,
    type: resourceType
  ): string {
    const events = {
      event: Object.keys(resource)[0],
      // eslint-disable-next-line @typescript-eslint/dot-notation
      resource: resource['Type']?.split('::')[1].toLowerCase()
    }
    const event = events[type]
    const relationEvents = {
      sqs: 'Subscriber',
      sns: 'Subscriber',
      http: `${resource[event]?.method?.toUpperCase()} ${resource[event]?.path}`
    }
    if (!relationEvents[event]) throw new Error(`Relation event '${event}' not mapped`)
    return relationEvents[event]
  }

  getActors(
    resource: CloudFormationResource | Event,
    resourceName: string,
    types: resourceType[],
    receiverName: string
  ): string {
    const actors = [
      this.getFirstActor(resource, resourceName, types[0]),
      this.getSecondActor(resource, types[1], receiverName)
    ]
    return actors.join(', ')
  }

  getFirstActor(
    resource: CloudFormationResource | Event,
    resourceName: string,
    type: resourceType
  ): string {
    const resourceType = this.getResourceType(resource, type)
    const prefix = plantUmlResource[resourceType]
    return this.getItemName(resourceName, prefix)
  }

  getSecondActor(
    resource: CloudFormationResource | Event,
    type: resourceType,
    receiverName: string
  ): string {
    const resourceType = this.getResourceType(resource, type)
    const prefix = plantUmlResource[resourceType]
    return this.getItemName(receiverName, prefix)
  }

  getResourceType(
    resource: CloudFormationResource | AwsFunction | Event,
    type: resourceType
  ): string {
    const resourceTypes = {
      function: 'Lambda',
      resource: resource['Type']?.split('::')[1],
      event: Object.keys(resource)[0].toUpperCase()
    }
    if (!resourceTypes[type]) throw new Error(`Type '${type}' not mapped`)
    return resourceTypes[type]
  }

  getItemName(
    resourceName: string,
    prefix: plantUmlResource
  ): string {
    const { serviceName } = this
    const itemNames = {
      Lambda:
        `${serviceName.camelCase}${Case.pascal(resourceName)}`,
      DynamoDB: resourceName,
      SimpleQueueService: resourceName,
      SimpleNotificationService: resourceName,
      APIGateway: serviceName.pascalCase
    }

    if (!itemNames[prefix]) throw new Error(`Prefix '${prefix}' not mapped`)
    return itemNames[prefix]
  }

  getItemLabel(
    resource: CloudFormationResource | AwsFunction | Event,
    prefix: plantUmlResource,
    resourceName: string
  ): string {
    const { serviceName, stage } = this

    const itemLabels = {
      Lambda: `${serviceName.default}-STAGE-${resourceName}`,
      DynamoDB: resource['Properties']?.TableName.replace(stage.lowercased, 'STAGE'),
      SimpleQueueService: resource['Properties']?.QueueName.replace(stage.lowercased, 'STAGE') || resourceName,
      SimpleNotificationService: resource['Properties']?.TopicName.replace(stage.lowercased, 'STAGE') || resourceName,
      APIGateway: serviceName.default
    }

    if (!itemLabels[prefix]) throw new Error(`Prefix type '${prefix}' not mapped`)
    return itemLabels[prefix]
  }
}

export default PlantUmlService