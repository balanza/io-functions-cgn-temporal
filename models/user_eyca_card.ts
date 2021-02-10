import { Container } from "@azure/cosmos";
import {
  CosmosdbModelVersioned,
  RetrievedVersionedModel
} from "io-functions-commons/dist/src/utils/cosmosdb_model_versioned";
import { wrapWithKind } from "io-functions-commons/dist/src/utils/types";
import * as t from "io-ts";
import { FiscalCode, NonEmptyString } from "italia-ts-commons/lib/strings";
import { CardStatus } from "../generated/definitions/CardStatus";

export const USER_EYCA_CARD_COLLECTION_NAME = "user-eyca-cards";
export const USER_EYCA_CARD_MODEL_PK_FIELD = "fiscalCode" as const;

const UserEycaCard = t.interface({
  // The EYCA card identifier
  cardNumber: NonEmptyString,
  // The id of the user
  fiscalCode: FiscalCode,
  // the status of the CGN related to the user
  status: CardStatus
});
export type UserEycaCard = t.TypeOf<typeof UserEycaCard>;

export const NewUserEycaCard = wrapWithKind(
  UserEycaCard,
  "INewUserEycaCard" as const
);

export type NewUserEycaCard = t.TypeOf<typeof NewUserEycaCard>;

export const RetrievedUserEycaCard = wrapWithKind(
  t.intersection([UserEycaCard, RetrievedVersionedModel]),
  "IRetrievedUserEycaCard" as const
);

export type RetrievedUserEycaCard = t.TypeOf<typeof RetrievedUserEycaCard>;

export class UserEycaCardModel extends CosmosdbModelVersioned<
  UserEycaCard,
  NewUserEycaCard,
  RetrievedUserEycaCard,
  typeof USER_EYCA_CARD_MODEL_PK_FIELD
> {
  /**
   * Creates a new UserCgn model
   *
   * @param container the DocumentDB container
   *
   */
  constructor(container: Container) {
    super(
      container,
      NewUserEycaCard,
      RetrievedUserEycaCard,
      USER_EYCA_CARD_MODEL_PK_FIELD
    );
  }
}
