type DynamoResultHandler<T> = (error: Error, result: T) => void
export default <T>(fn: (handler: DynamoResultHandler<T>) => any) => new Promise<T>((resolve, reject) => {
  fn((error: Error, result: T) => {
    if(error) {
      reject(error)
    } else {
      resolve(result)
    }
  })
})
