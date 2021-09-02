import * as express from "express";

import { Context } from "@azure/functions";
import { ContextMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/context_middleware";
import { RequiredParamMiddleware } from "@pagopa/io-functions-commons/dist/src/utils/middlewares/required_param";
import {
  withRequestMiddlewares,
  wrapRequestHandler
} from "@pagopa/io-functions-commons/dist/src/utils/request_middleware";
import {
  IResponseErrorConflict,
  IResponseErrorForbiddenNotAuthorized,
  IResponseErrorInternal,
  IResponseErrorNotFound,
  IResponseSuccessJson,
  ResponseErrorConflict,
  ResponseErrorForbiddenNotAuthorized,
  ResponseErrorInternal,
  ResponseErrorNotFound,
  ResponseSuccessJson
} from "@pagopa/ts-commons/lib/responses";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";
import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import * as TE from "fp-ts/lib/TaskEither";

import { NonNegativeInteger } from "@pagopa/ts-commons/lib/numbers";
import { fromPredicate } from "fp-ts/lib/TaskEither";
import { CardPending } from "../generated/definitions/CardPending";
import { EycaCard } from "../generated/definitions/EycaCard";
import { UserCgnModel } from "../models/user_cgn";
import { UserEycaCard, UserEycaCardModel } from "../models/user_eyca_card";
import { isEycaEligible } from "../utils/cgn_checks";

type ErrorTypes =
  | IResponseErrorNotFound
  | IResponseErrorInternal
  | IResponseErrorConflict
  | IResponseErrorForbiddenNotAuthorized;
type ResponseTypes = IResponseSuccessJson<EycaCard> | ErrorTypes;

type IGetEycaStatusHandler = (
  context: Context,
  fiscalCode: FiscalCode
) => Promise<ResponseTypes>;

export function GetEycaStatusHandler(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaUpperBoundAge: NonNegativeInteger
): IGetEycaStatusHandler {
  return async (_, fiscalCode) =>
    pipe(
      isEycaEligible(fiscalCode, eycaUpperBoundAge),
      TE.fromEither,
      TE.mapLeft(() =>
        ResponseErrorInternal("Cannot perform user's EYCA eligibility check")
      ),
      TE.chainW(
        TE.fromPredicate(
          isEligible => isEligible,
          () => ResponseErrorForbiddenNotAuthorized
        )
      ),
      TE.chainW(() =>
        pipe(
          userEycaCardModel.findLastVersionByModelId([fiscalCode]),
          TE.mapLeft(() =>
            ResponseErrorInternal(
              "Error trying to retrieve user's EYCA Card status"
            )
          )
        )
      ),
      TE.chainW(maybeUserEycaCard =>
        pipe(
          maybeUserEycaCard,
          E.fromOption(() =>
            ResponseErrorNotFound(
              "Not Found",
              "User's EYCA Card status not found"
            )
          ),
          TE.fromEither,
          TE.chain(card => TE.of(card)),
          TE.orElse(notFoundError =>
            pipe(
              userCgnModel.findLastVersionByModelId([fiscalCode]),
              TE.mapLeft(() =>
                ResponseErrorInternal(
                  "Error trying to retrieve user's CGN Card status"
                )
              ),
              TE.chainW(maybeUserCgn =>
                pipe(
                  maybeUserCgn,
                  E.fromOption(() => notFoundError),
                  TE.fromEither
                )
              ),
              TE.chainW(
                TE.fromPredicate(
                  userCgn => CardPending.is(userCgn.card),
                  () =>
                    ResponseErrorConflict(
                      "EYCA Card is missing while citizen is eligible to obtain it"
                    )
                )
              ),
              TE.chainW(() => TE.left(notFoundError))
            )
          )
        )
      ),
      TE.map(userEycaCard => ResponseSuccessJson(userEycaCard.card)),
      TE.toUnion
    )();
}

export function GetEycaStatus(
  userEycaCardModel: UserEycaCardModel,
  userCgnModel: UserCgnModel,
  eycaUpperBoundAge: NonNegativeInteger
): express.RequestHandler {
  const handler = GetEycaStatusHandler(
    userEycaCardModel,
    userCgnModel,
    eycaUpperBoundAge
  );

  const middlewaresWrap = withRequestMiddlewares(
    ContextMiddleware(),
    RequiredParamMiddleware("fiscalcode", FiscalCode)
  );

  return wrapRequestHandler(middlewaresWrap(handler));
}
