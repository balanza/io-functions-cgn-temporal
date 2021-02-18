import { Context } from "@azure/functions";
import { fromOption, toError } from "fp-ts/lib/Either";
import { identity } from "fp-ts/lib/function";
import {
  fromEither,
  fromLeft,
  taskEither,
  tryCatch
} from "fp-ts/lib/TaskEither";
import * as t from "io-ts";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import {
  EycaAPIClient,
  eycaApiPassword,
  eycaApiUsername
} from "../clients/eyca";
import { StatusEnum } from "../generated/definitions/CardActivated";
import { CcdbNumber } from "../generated/eyca-api/CcdbNumber";
import { ErrorResponse } from "../generated/eyca-api/ErrorResponse";
import { ShortDate } from "../generated/eyca-api/ShortDate";
import { UserEycaCardModel } from "../models/user_eyca_card";
import { ActivityResult, failure, success } from "../utils/activity";
import { extractEycaExpirationDate } from "../utils/cgn_checks";
import { errorsToError } from "../utils/conversions";

export const ActivityInput = t.interface({
  fiscalCode: FiscalCode
});

export type ActivityInput = t.TypeOf<typeof ActivityInput>;

const updateCard = (
  eycaClient: ReturnType<EycaAPIClient>,
  ccdbNumber: CcdbNumber,
  cardDateExpiration: ShortDate
) =>
  tryCatch(
    () =>
      eycaClient.updateCard({
        card_date_expiration: cardDateExpiration.toISOString(),
        ccdb_number: ccdbNumber,
        password: eycaApiPassword,
        type: "json",
        username: eycaApiUsername
      }),
    toError
  )
    .mapLeft(err => new Error(`Cannot call EYCA updateCard API ${err.message}`))
    .chain(_ => fromEither(_).mapLeft(errorsToError))
    .chain(res =>
      res.status !== 200 || ErrorResponse.is(res.value.api_response)
        ? fromLeft(
            new Error(
              `Error on EYCA updateCard API|STATUS=${res.status}, DETAIL=${res.value.api_response.text}`
            )
          )
        : taskEither.of(res.value.api_response.text)
    );

const preIssueCardCode = (eycaClient: ReturnType<EycaAPIClient>) =>
  tryCatch(
    // tslint:disable-next-line: no-hardcoded-credentials
    () =>
      eycaClient.preIssueCard({
        password: eycaApiPassword,
        type: "json",
        username: eycaApiUsername
      }),
    toError
  )
    .chain(_ => fromEither(_).mapLeft(errorsToError))
    .chain(response =>
      response.status !== 200 || ErrorResponse.is(response.value.api_response)
        ? fromLeft(
            new Error(
              `Error on EYCA preIssueCard API|STATUS=${response.status}, DETAIL=${response.value.api_response.text}`
            )
          )
        : taskEither.of(response.value.api_response.text)
    )
    .chain(responseText =>
      fromEither(CcdbNumber.decode(responseText).mapLeft(errorsToError))
    );

export const getSuccessEycaActivationActivityHandler = (
  eycaClient: ReturnType<EycaAPIClient>,
  userEycaCardModel: UserEycaCardModel,
  logPrefix: string = "SuccessEycaActivationActivityHandler"
) => (context: Context, input: unknown): Promise<ActivityResult> => {
  const fail = failure(context, logPrefix);
  return fromEither(ActivityInput.decode(input))
    .mapLeft(errs => fail(errorsToError(errs), "Cannot decode Activity Input"))
    .chain(({ fiscalCode }) =>
      userEycaCardModel
        .findLastVersionByModelId([fiscalCode])
        .mapLeft(() =>
          fail(
            new Error("Cannot retrieve EYCA card for the provided fiscalCode")
          )
        )
        .chain(maybeEycaCard =>
          fromEither(
            fromOption(
              fail(new Error("No EYCA card found for the provided fiscalCode"))
            )(maybeEycaCard)
          )
        )
        .chain(eycaCard =>
          fromEither(extractEycaExpirationDate(fiscalCode))
            .chain(expirationDate =>
              preIssueCardCode(eycaClient).map(cardNumber => ({
                ...eycaCard,
                cardStatus: {
                  activation_date: new Date(),
                  card_number: cardNumber,
                  expiration_date: expirationDate,
                  status: StatusEnum.ACTIVATED
                }
              }))
            )
            .mapLeft(err => fail(err))
        )
    )
    .chain(_ =>
      userEycaCardModel
        .update(_)
        .mapLeft(err => fail(toError(err), "Cannot update EYCA card"))
        .chain(() =>
          updateCard(
            eycaClient,
            _.cardStatus.card_number,
            _.cardStatus.expiration_date
          ).bimap(fail, () => success())
        )
    )
    .fold<ActivityResult>(identity, identity)
    .run();
};
