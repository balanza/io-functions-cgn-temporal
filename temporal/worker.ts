// @@@SNIPSTART typescript-mtls-worker
import * as path from "path";
import { writeFile } from "fs/promises";
import { Worker, Core, bundleWorkflowCode } from "@temporalio/worker";
import * as activities from "./activities";

/**
 * Run a Worker with an mTLS connection, configuration is provided via environment variables.
 * Note that serverNameOverride and serverRootCACertificate are optional.
 */
// eslint-disable-next-line prefer-arrow/prefer-arrow-functions,@typescript-eslint/explicit-function-return-type
async function run({ address, namespace, taskQueue }: IEnv) {
  console.log("------>>> Daje mo faccio qualcosa");

  await Core.install({
    serverOptions: {
      address,
      namespace
    }
  });

  const worker = await Worker.create({
    activities,
    taskQueue,
    workflowsPath: require.resolve("./workflows")
  });
  console.log("------>>> Worker connection successfully established");

  await worker.run();
}

// @@@SNIPEND

// Helpers for configuring the mTLS client and worker samples

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ReferenceError(`${name} environment variable is not defined`);
  }
  return value;
}

export interface IEnv {
  readonly address: string;
  readonly namespace: string;
  readonly taskQueue: string;
}

export const getEnv = (): IEnv => ({
  address: requiredEnv("TEMPORAL_ADDRESS"),
  namespace: requiredEnv("TEMPORAL_NAMESPACE"),
  taskQueue: requiredEnv("TEMPORAL_TASK_QUEUE")
});

// eslint-disable-next-line functional/no-let
let started = false;
export default async () => {
  if (!started) {
    console.log("+++++daje!+++++");
    started = true;
    return run(getEnv())
      .then(_ => {
        console.log("------->>>> OKKKK");
      })
      .catch(err => {
        console.log("-------->>>> ERROR");
        console.error(err);
        process.exit(1);
      });
  } else {
    console.log("+++++cached+++++");
  }
};
