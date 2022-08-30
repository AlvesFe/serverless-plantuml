import logger from './logger'

describe('test logger', () => {
  it('logger info', () => {
    expect.assertions(1)
    console.log = jest.fn()
    logger('test')
    expect(console.log).toHaveBeenCalledWith('Serverless PlantUml: ', '\x1b[33mtest\x1b[0m')
  })
})