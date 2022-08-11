const caseConverter = require('../utils/caseConverter')
const logger = require('../utils/logger')

class PlantUmlService {
  constructor(serviceName, stage, debug) {
    this.IS_DEBUG = debug
    this.serviceName = {
      default: serviceName,
      camelCase: caseConverter(serviceName, 'kebab', 'camel')
    }
    this.stage = {
      default: stage,
      capitalized: caseConverter(stage, 'camel', 'pascal'),
      lowercased: stage.toLowerCase()
    }
  }

  resourceBuilder(resource, resourceName, type) {
    try {
      const resourceType = this.getResourceType(resource, type)
      const prefix = this.getPrefix(resource, resourceType)
      const itemName = this.getItemName(resourceName, prefix)
      const itemLabel = this.getItemLabel(resource, prefix, resourceName)
      const definition = this.getDefinition(prefix)
      return `${prefix}(${itemName}, "${itemLabel}", "${definition}")`
    } catch (error) {
      this.IS_DEBUG && console.error(error)
      logger(`Could not build resource '${resourceName}'`, 'warn')
      return null
    }
  }

  relationBuilder(resource, resourceName, receiverName, relationType) {
    try {
      const typeGroups = {
        events: ['event', 'function'],
        resources: ['resource', 'resource']
      }
      const types = typeGroups[relationType]
      if (!types) throw new Error(`Relation type '${relationType}' not mapped`)
      const actors = this.getActors(resource, resourceName, types, receiverName)
      const eventName = this.getRelationEvent(resource, types[0])
      const relationMethod = this.getRelationMethod(resource, types[0])
      return `Rel(${actors}, "${eventName}", "${relationMethod}")`
    } catch (error) {
      this.IS_DEBUG && console.error(error)
      logger(`Could not build relation '${resourceName}'`, 'warn')
      return null
    }
  }

  getRelationMethod(resource, type) {
    const events = {
      event: Object.keys(resource)[0],
      resource: resource?.Type?.split('::')[1].toLowerCase()
    }
    const event = events[type]
    const relationMethods = {
      sqs: 'SQS',
      http: 'HTTP',
      sns: 'SNS'
    }
    if(!relationMethods[event]) throw new Error(`Relation method '${event}' not mapped`)
    return relationMethods[event]
  }

  getRelationEvent(resource, type) {
    const events = {
      event: Object.keys(resource)[0],
      resource: resource?.Type?.split('::')[1].toLowerCase()
    }
    const event = events[type]
    const relationEvents = {
      sqs: 'Subscriber',
      sns: 'Subscriber',
      http: `${resource[event]?.method?.toUpperCase()} ${resource[event]?.path}`
    }
    if(!relationEvents[event]) throw new Error(`Relation event '${event}' not mapped`)
    return relationEvents[event]
  }

  getActors(resource, resourceName, types, receiverName) {
    const actors = [
      this.getFirstActor(resource, resourceName, types[0]),
      this.getSecondActor(resource, types[1], receiverName)
    ]
    return actors.join(', ')
  }

  getFirstActor(resource, resourceName, type) {
    const resourceType = this.getResourceType(resource, type)
    const prefix = this.getPrefix(resource, resourceType)
    return this.getItemName(resourceName, prefix)
  }

  getSecondActor(resource, type, receiverName) {
    const resourceType = this.getResourceType(resource, type)
    const prefix = this.getPrefix(resource, resourceType)
    return this.getItemName(receiverName, prefix)
  }

  getResourceType(resource, type) {
    const resourceTypes = {
      function: 'Lambda',
      resource: resource?.Type?.split('::')[1],
      event: Object.keys(resource)[0].toUpperCase()
    }
    if (!resourceTypes[type]) throw new Error(`Type '${type}' not mapped`)
    return resourceTypes[type]
  }

  getPrefix(resource, resourceType) {
    const prefixes = {
      Lambda: 'Lambda',
      DynamoDB: 'DynamoDB',
      SQS: 'SimpleQueueService',
      SNS: 'SimpleNotificationService',
      HTTP: 'APIGateway'
    }

    if (!prefixes[resourceType])
      throw new Error(`Resource type '${resource.Type}' not mapped`)
    return prefixes[resourceType]
  }

  getItemName(resourceName, prefix) {
    const { stage, serviceName } = this
    const itemNames = {
      Lambda:
        `${serviceName.camelCase}${caseConverter(resourceName, 'camel', 'pascal')}`,
      DynamoDB: `${resourceName}${stage.capitalized}`,
      SimpleQueueService: `${resourceName}${stage.capitalized}`,
      SimpleNotificationService: `${resourceName}${stage.capitalized}`,
      APIGateway: `${stage.lowercased}${serviceName.camelCase}`
    }

    if (!itemNames[prefix]) throw new Error(`Prefix '${prefix}' not mapped`)
    return itemNames[prefix]
  }

  getItemLabel(resource, prefix, resourceName) {
    const { serviceName } = this

    const itemLabels = {
      Lambda: `${serviceName.default}_${resourceName}`,
      DynamoDB: resource?.Properties?.TableName,
      SimpleQueueService: resource?.Properties?.QueueName || resourceName,
      SimpleNotificationService: resource?.Properties?.TopicName || resourceName,
      APIGateway: serviceName.default
    }

    if (!itemLabels[prefix]) throw new Error(`Prefix type '${prefix}' not mapped`)
    return itemLabels[prefix]
  }

  getDefinition(prefix) {
    const definitions = {
      Lambda: 'Lambda function',
      DynamoDB: 'DynamoDB',
      SimpleQueueService: 'SQS',
      SimpleNotificationService: 'SNS',
      APIGateway: 'API Gateway'
    }

    if (!definitions[prefix]) throw new Error(`Prefix type '${prefix}' not mapped`)
    return definitions[prefix]
  }
}

module.exports = PlantUmlService