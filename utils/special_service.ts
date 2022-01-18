import { IOrchestrationFunctionContext } from "durable-functions/lib/src/iorchestrationfunctioncontext";
import { pipe } from "fp-ts/lib/function";
import * as E from "fp-ts/lib/Either";
import { ActivityInput as UpsertSpecialServiceActivationActivityInput } from "../UpsertSpecialServiceActivationActivity/handler";
import { ActivityResult } from "./activity";
import { getTrackExceptionAndThrowWithErrorStatus } from "./orchestrators";
import { internalRetryOptions } from "./retry_policies";

export const upsertSpecialServiceGenerator = (
  context: IOrchestrationFunctionContext
) =>
  function*(
    activityInput: UpsertSpecialServiceActivationActivityInput,
    trackExAndThrowWithError: ReturnType<
      typeof getTrackExceptionAndThrowWithErrorStatus
    >
  ): Generator {
    return pipe(
      yield context.df.callActivityWithRetry(
        "UpsertSpecialServiceActivationActivity",
        internalRetryOptions,
        activityInput
      ),
      ActivityResult.decode,
      E.getOrElseW(e =>
        trackExAndThrowWithError(
          e,
          `cgn.update.exception.upsertSpecialService.${activityInput.activationStatus
            .toString()
            .toLowerCase()}.activityOutput`
        )
      ),
      E.fromPredicate(
        upsertSpecialServiceResult =>
          upsertSpecialServiceResult.kind === "SUCCESS",
        () =>
          trackExAndThrowWithError(
            new Error("Cannot upsert CGN Special service activation"),
            `cgn.update.exception.failure.upsertSpecialService.${activityInput.activationStatus
              .toString()
              .toLowerCase()}.activityOutput`
          )
      )
    );
  };
