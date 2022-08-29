import PlantUml from './index'
import * as fs from 'fs'
import { service, generatedResources, mockOptions, mockDiagram } from './mock/plantUmlPlugin'

const serverlessFile = fs.readFileSync('./data/serverlessFile.json').toString()
const payload = JSON.parse(serverlessFile)

describe('PlantUml Plugin', () => {
  it('initialize', async () => {
    expect.assertions(1)
    const plantUmlService = new PlantUml(payload)
    jest.spyOn(plantUmlService, 'initialize').mockResolvedValue()
    await plantUmlService.initialize()
    expect(plantUmlService.initialize).toBeCalledTimes(1)
  })

  it('initialize - error', async () => {
    expect.assertions(1)
    console.log = jest.fn()
    const plantUmlService = new PlantUml({
      configurationInput: {
        custom: {
          plantUml: {
            path: 'docs/diagram?test'
          }
        }
      }
    })
    await plantUmlService.initialize()
    expect(console.log).toHaveBeenCalledWith('Serverless PlantUml: ', '\x1b[31mCould not generate diagram\x1b[0m')
  })

  it('initialize - s3Put', async () => {
    expect.assertions(1)
    const plantUmlService = new PlantUml(payload)
    jest.spyOn(plantUmlService, 'putS3').mockResolvedValue()
    await plantUmlService.initialize(true)
    expect(plantUmlService.putS3).toBeCalledTimes(1)
  })

  it('generateResources', () => {
    expect.assertions(1)
    const plantUmlService = new PlantUml(payload)
    const resources = plantUmlService.generateResources(service)
    expect(typeof resources).toBe('string')
  })

  it('createdDiagram', () => {
    expect.assertions(1)
    const plantUmlService = new PlantUml(payload)
    const diagram = plantUmlService.createDiagram(generatedResources, mockOptions)
    expect(typeof diagram).toBe('string')
  })

  it('createdDiagram - new diagram', () => {
    expect.assertions(1)
    const newPayload = {
      ...payload,
      configurationInput: {
        ...payload.configurationInput,
        custom: {
          ...payload.configurationInput.custom,
          plantUml: {
            path: './'
          }
        }
      }
    }
    const plantUmlService = new PlantUml(newPayload)
    const diagram = plantUmlService.createDiagram(generatedResources, mockOptions)
    expect(typeof diagram).toBe('string')
  })

  it('saveDiagram', () => {
    expect.assertions(1)
    const plantUmlService = new PlantUml(payload)
    jest.spyOn(plantUmlService, 'saveDiagram').mockReturnValue()
    plantUmlService.saveDiagram(mockDiagram, mockOptions)
    expect(plantUmlService.saveDiagram).toBeCalledTimes(1)
  })

  it('putS3', async () => {
    expect.assertions(1)
    const plantUmlService = new PlantUml(payload)
    jest.spyOn(plantUmlService, 'putS3').mockResolvedValue()
    await plantUmlService.putS3(mockDiagram, mockOptions)
    expect(plantUmlService.putS3).toBeCalledTimes(1)
  })
})