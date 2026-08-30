// Polyfill for Promise.withResolvers (Node.js < 22).
// tsdown 0.22+ uses this API; git-source installs may run on older Node.
if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve
    let reject
    const promise = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }
}
