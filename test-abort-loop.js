const abort = new AbortController()
console.log("Waiting for abort...");
(async () => {
  await new Promise(resolve => abort.signal.addEventListener("abort", resolve))
  console.log("Aborted!");
})();
