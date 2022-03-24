/* eslint-disable sort-keys */
import * as t from "io-ts";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe } from "fp-ts/lib/function";
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { proxyActivities } from "@temporalio/workflow";
import { consumeCompletion } from "@temporalio/workflow/lib/internals";
import { identity } from "lodash";
import { te } from "date-fns/locale";
import { Card } from "../generated/definitions/Card";

// eslint-disable-next-line prettier/prettier
import type * as activities from '../temporal/activities'; 
import { ActivityResultFailure, ActivityResultSuccess } from "../utils/activity";
import { CardActivated, StatusEnum as ActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { getErrorMessage } from "../utils/messages";

export const OrchestratorInput = t.interface({
  fiscalCode: FiscalCode,
  newStatusCard: Card
});
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

const { UpdateCgnStatusActivity, StoreCgnExpirationActivity, SendMessageActivity } = proxyActivities<typeof activities>({
  
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
    initialInterval: 3000,
    backoffCoefficient: 1
  }
});

const toActivityFailure = (err: unknown): ActivityResultFailure => ActivityResultFailure.encode({kind: "FAILURE", reason: E.toError(err).message});

const doNothing = void 0;

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export async function UpdateCgnOrchestrator(
  input: OrchestratorInput,
  _eycaUpperBoundAge: NonNegativeInteger
): Promise<ActivityResultFailure | ActivityResultSuccess> {

  const p = pipe(
    input,
    OrchestratorInput.decode,
    E.mapLeft(e => ActivityResultFailure.encode({ kind: "FAILURE", reason: (readableReport(e))})),
    TE.fromEither,
    TE.chain(({ newStatusCard, fiscalCode }) => 
      pipe(
         // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
         (() => {
          if (newStatusCard.status === ActivatedStatusEnum.ACTIVATED){
            // TODO: callUpsertSpecialServiceActivity
            return TE.right(doNothing);
          }
          return TE.right(doNothing);
        })(),
        TE.chain(() => newStatusCard.status === ActivatedStatusEnum.ACTIVATED ?
             TE.tryCatch(
                () => StoreCgnExpirationActivity({
                      activationDate: newStatusCard.activation_date,
                      expirationDate: newStatusCard.expiration_date,
                      fiscalCode
                    }),
              toActivityFailure
             ):TE.right(doNothing)
        ),
        
        TE.chain(() => 
           TE.tryCatch(
              () => UpdateCgnStatusActivity({ card: newStatusCard, fiscalCode }),
              toActivityFailure
            )
        ),
        TE.chain(() => {
          if (newStatusCard.status === ActivatedStatusEnum.ACTIVATED){
            // TODO: callUpsertSpecialServiceActivity
          }
          return TE.right(doNothing);
        }),
    
        // eslint-disable-next-line sonarjs/no-identical-functions
        TE.chain(() => {
          if (newStatusCard.status === ActivatedStatusEnum.ACTIVATED){
            // TODO: fork orkestrator for EYCA activation
          }
          return TE.right(doNothing);
        }),

        TE.map(_ => ActivityResultSuccess.encode({kind: "SUCCESS"})),

          TE.orElse(failure => pipe(
            // TODO: timer
            TE.of(doNothing),
            TE.chain(() => 
              TE.tryCatch(
                () => SendMessageActivity({
                  checkProfile: false,
                  content: getErrorMessage(),
                  fiscalCode
                }),
                () => failure
              )
            ),
            TE.chain(__ => TE.left(failure))
          )
        )
      )
    ),
    
    TE.toUnion
  );

  return p();
}
