import { AzureFunction, Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import * as express from "express";

import { Connection, WorkflowClient } from "@temporalio/client";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { UpdateCgnOrchestrator } from "../temporal/workflows";
import run from "../temporal/worker";
import { getConfigOrThrow } from "../utils/config";
import { OrchestratorInput } from "../UpdateCgnOrchestratorT";
import { StatusEnum } from "../generated/definitions/CardPending";

const config = getConfigOrThrow();

// Setup Express
const app = express();
secureExpressApp(app);

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ReferenceError(`${name} environment variable is not defined`);
  }
  return value;
}

// Add express route
app.get("/api/v1/cgn/start", async (_req, res) => {
  const connection = new Connection({
    address: requiredEnv("TEMPORAL_ADDRESS")
  });
  await connection.untilReady();
  const client = new WorkflowClient(connection.service, {
    namespace: requiredEnv("TEMPORAL_NAMESPACE")
  });

  const input: OrchestratorInput = {
    fiscalCode: "DCPMNL86A24H501I" as FiscalCode,
    newStatusCard: {
      status: StatusEnum.PENDING
    }
  };

  try {
    //  await run();
    const result = await client.execute(UpdateCgnOrchestrator, {
      args: [input, config.EYCA_UPPER_BOUND_AGE],
      taskQueue: requiredEnv("TEMPORAL_TASK_QUEUE"),
      workflowId: `my-business-id-${Date.now()}`
    });

    if (result instanceof Error) {
      res.send(result.message);
      res.sendStatus(500);
    } else {
      res.send("ok");
      res.sendStatus(2);
    }
  } catch (e) {
    console.error("++++", e);
    res.send(e);
    res.sendStatus(500);
  }

  res.end();
});

const azureFunctionHandler = createAzureFunctionHandler(app);

const httpStart: AzureFunction = (context: Context): void => {
  setAppContext(app, context);
  azureFunctionHandler(context);
};

export default httpStart;
