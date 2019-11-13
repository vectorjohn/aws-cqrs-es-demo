export default (variable: string) => {
  if (!process.env.hasOwnProperty(variable)) {
    throw new Error('Expected environment variable defined: ' + variable)
  }
  return process.env[variable] as string
}
