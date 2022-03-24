import run from "./worker";

run()
  .then(() => console.log("ok"))
  .catch(console.error);
