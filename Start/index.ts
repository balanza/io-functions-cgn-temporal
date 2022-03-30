import { AzureFunction, Context } from "@azure/functions";
import createAzureFunctionHandler from "@pagopa/express-azure-functions/dist/src/createAzureFunctionsHandler";
import { secureExpressApp } from "@pagopa/io-functions-commons/dist/src/utils/express";
import { setAppContext } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import * as express from "express";
import * as E from "fp-ts/lib/Either";
import { Connection, WorkflowClient } from "@temporalio/client";
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { UpdateCgnOrchestrator } from "../temporal/workflows";
import run from "../temporal/worker";
import { getConfigOrThrow } from "../utils/config";
import { OrchestratorInput } from "../UpdateCgnOrchestratorT";
import { StatusEnum as PendingStatusEnum } from "../generated/definitions/CardPending";
import { StatusEnum as ActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { cosmosdbClient } from "../utils/cosmosdb";
import { UserCgnModel, USER_CGN_COLLECTION_NAME } from "../models/user_cgn";
import { genRandomCardCode } from "../utils/cgnCode";
import { extractCgnExpirationDate } from "../utils/cgn_checks";
import { makeUpdateCgnOrchestratorId } from "../utils/orchestrators";

const config = getConfigOrThrow();

// Setup Express
const app = express();
secureExpressApp(app);

const userCgnsContainer = cosmosdbClient
  .database(config.COSMOSDB_CGN_DATABASE_NAME)
  .container(USER_CGN_COLLECTION_NAME);

const userCgnModel = new UserCgnModel(userCgnsContainer);

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

  const fiscalCode = "DCPMNL86A24H501I" as FiscalCode;

  const cgnExpirationDateOrError = await extractCgnExpirationDate(
    fiscalCode,
    config.CGN_UPPER_BOUND_AGE
  )();
  if (E.isLeft(cgnExpirationDateOrError)) {
    return cgnExpirationDateOrError.left;
  }

  const input: OrchestratorInput = {
    fiscalCode,
    newStatusCard: {
      activation_date: new Date(),
      expiration_date: cgnExpirationDateOrError.right,
      status: ActivatedStatusEnum.ACTIVATED
    }
  };

  try {
    const cgnId = await genRandomCardCode();

    const orchestratorId = makeUpdateCgnOrchestratorId(
      fiscalCode,
      ActivatedStatusEnum.ACTIVATED
    ) as NonEmptyString;
    //  await run();
    const upsertResult = await userCgnModel.upsert({
      card: { status: PendingStatusEnum.PENDING },
      fiscalCode: input.fiscalCode,
      id: cgnId,
      kind: "INewUserCgn"
    })();

    if (E.isLeft(upsertResult)) {
      res.send(upsertResult.left);
      res.sendStatus(500);
    }
    const result = await client.execute(UpdateCgnOrchestrator, {
      args: [input, config.EYCA_UPPER_BOUND_AGE],
      taskQueue: requiredEnv("TEMPORAL_TASK_QUEUE"),
      workflowId: orchestratorId
    });

    if (result instanceof Error) {
      res.send(result.message);
      res.sendStatus(500);
    } else {
      res.send("ok");
      res.sendStatus(200);
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
