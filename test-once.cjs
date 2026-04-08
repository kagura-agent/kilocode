const once = (fn) => {
    const state = {}
    return () => {
      if (!state.promise) state.promise = Promise.resolve(fn())
      return state.promise
    }
}
const thrower = once(() => { throw new Error('sync fail') })
try {
  thrower()
} catch(e) {
  console.error("Caught:", e.message)
}
