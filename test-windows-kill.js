try {
  process.kill(99999, 0);
  console.log("Alive");
} catch (err) {
  console.log("Error code:", err.code);
}
