import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { TableService } from "azure-storage";
import { flow, pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { Timestamp } from "../generated/definitions/Timestamp";
import {
  ActivityResult,
  ActivityResultFailure,
  success
} from "../utils/activity";
import { errorsToError } from "../utils/conversions";
import {
  Failure,
  toPermanentFailure,
  toTransientFailure,
  TransientFailure
} from "../utils/errors";
import { insertCardExpiration } from "../utils/table_storage";

export const ActivityInput = t.interface({
  activationDate: Timestamp,
  expirationDate: Timestamp,
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getStoreCgnExpirationActivityHandler = (
  tableService: TableService,
  cgnExpirationTableName: NonEmptyString,
  logPrefix: string = "StoreCgnExpirationActivity"
) => (input: ActivityInput): Promise<ActivityResult> => {
  const fail = (err: Failure): ActivityResultFailure => {
    // eslint-disable-next-line no-console
    console.error(logPrefix, err);

    if (TransientFailure.is(err)) {
      throw new Error();
    }
    return {
      kind: "FAILURE",
      reason: err.reason
    };
  };
  const insertCgnExpirationTask = insertCardExpiration(
    tableService,
    cgnExpirationTableName
  );
  return pipe(
    input,
    ActivityInput.decode,
    TE.fromEither,
    TE.mapLeft(
      flow(errorsToError, e =>
        toPermanentFailure(e, "Cannot decode Activity Input")
      )
    ),
    TE.chain(activityInput =>
      pipe(
        insertCgnExpirationTask(
          activityInput.fiscalCode,
          activityInput.activationDate,
          activityInput.expirationDate
        ),
        TE.bimap(
          err => toTransientFailure(err, "Cannot insert CGN expiration tuple"),
          success
        )
      )
    ),
    TE.mapLeft(fail),
    TE.toUnion
  )();
};
