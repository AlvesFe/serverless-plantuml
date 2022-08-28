export enum relationTypes {
  Events = 'events',
  Resources = 'resources'
}

export enum resourceType {
  Event = 'event',
  Function = 'function',
  Resource = 'resource'
}

export enum plantUmlResource {
  Lambda = 'Lambda',
  DynamoDB = 'DynamoDB',
  SQS = 'SimpleQueueService',
  SNS = 'SimpleNotificationService',
  HTTP = 'APIGateway'
}

export enum plantUmlDefinition {
  Lambda = 'Lambda function',
  DynamoDB = 'DynamoDB',
  SimpleQueueService = 'SQS',
  SimpleNotificationService = 'SNS',
  APIGateway = 'API Gateway'
}