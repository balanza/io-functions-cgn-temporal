/* eslint-disable sort-keys */
import * as t from "io-ts";
import * as E from "fp-ts/lib/Either";
import * as TE from "fp-ts/lib/TaskEither";
import { pipe, identity } from 'fp-ts/lib/function';
import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import * as workflow from "@temporalio/workflow";
import { Card } from "../generated/definitions/Card";

// eslint-disable-next-line prettier/prettier
import type * as activities from '../temporal/activities'; 
import { ActivityResultFailure, ActivityResultSuccess} from '../utils/activity';
import { StatusEnum as ActivatedStatusEnum } from "../generated/definitions/CardActivated";
import { getErrorMessage, getMessage } from "../utils/messages";
import { assertNever } from '../utils/types';

export const OrchestratorInput = t.interface({
  fiscalCode: FiscalCode,
  newStatusCard: Card
});
export type OrchestratorInput = t.TypeOf<typeof OrchestratorInput>;

const { UpdateCgnStatusActivity, StoreCgnExpirationActivity, SendMessageActivity } = workflow.proxyActivities<typeof activities>({
  
  startToCloseTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
    initialInterval: 3000,
    backoffCoefficient: 1
  }
});

const toActivityFailure = (err: unknown): ActivityResultFailure => ActivityResultFailure.encode({kind: "FAILURE", reason: E.toError(err).message});

const doNothing = void 0;

export const unblockSignal = workflow.defineSignal('unblock');

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export async function UpdateCgnOrchestrator(
  input: OrchestratorInput,
  _eycaUpperBoundAge: NonNegativeInteger
): Promise<ActivityResultFailure | ActivityResultSuccess> {
  let isBlocked = true;
  workflow.setHandler(unblockSignal, () => void (isBlocked = false));
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
          return TE.right(ActivityResultSuccess.encode({kind: "SUCCESS"}));
        }),
    
        // eslint-disable-next-line sonarjs/no-identical-functions
        TE.chain(() => {
          if (newStatusCard.status === ActivatedStatusEnum.ACTIVATED){
            // TODO: fork orkestrator for EYCA activation
          }
          return TE.right(ActivityResultSuccess.encode({kind: "SUCCESS"}));
        }),
        TE.chainW(success => pipe(
          TE.tryCatch(() => workflow.condition(() => !isBlocked, 60000), E.toError),
          TE.filterOrElseW(identity, () => "send mesaage"),
          TE.orElseW(() => 
            TE.tryCatch(
              () => SendMessageActivity({
                checkProfile: false,
                content: getMessage(newStatusCard),
                fiscalCode
              }),
              () => ({kind: "FAILURE" as const, reason: "SEND ERROR"})
            )
          )
        )
      ),
      TE.orElse(failure => pipe(
          TE.tryCatch(() => workflow.condition(() => !isBlocked, 60000), E.toError),
          TE.filterOrElseW(identity, () => "send mesaage"),
          TE.orElseW(() => 
            TE.tryCatch(
              () => SendMessageActivity({
                checkProfile: false,
                content: getErrorMessage(),
                fiscalCode
              }),
              () => failure
            )
          ),
          TE.orElseW(__ => TE.left(failure))
        )
      ),
      TE.map(_ => ActivityResultSuccess.encode({kind: "SUCCESS"}))
    )
  ),
    
    TE.toUnion
  );

  return p();
}
