import { Functions, Resources } from 'serverless/aws'

export interface Options {
  path: string
  name: string
  s3Path: string
  s3Bucket: string
}

export interface Service {
  serviceName: string
  stage: string
  functions?: Functions | undefined
  resources?: Resources | undefined
}
