/* eslint-disable @typescript-eslint/no-explicit-any */
import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import * as date_fns from "date-fns";
import * as TE from "fp-ts/lib/TaskEither";
import { context } from "../../__mocks__/durable-functions";
import { now, testFail } from "../../__mocks__/mock";
import * as tableUtils from "../../utils/table_storage";
import {
  ActivityInput,
  getStoreCgnExpirationActivityHandler
} from "../handler";
import { toError } from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const tableServiceMock = jest.fn();
const expiredCgnTableName = "aTable" as NonEmptyString;

const insertCgnExpirationMock = jest.fn();
jest
  .spyOn(tableUtils, "insertCardExpiration")
  .mockImplementation(insertCgnExpirationMock);

const anActivityInput: ActivityInput = {
  activationDate: now,
  expirationDate: date_fns.addYears(now, 5),
  fiscalCode: aFiscalCode
};

describe("StoreCgnExpirationActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should throw if an error occurs during CgnExpiration insert", async () => {
    const storeCgnExpirationActivityHandler = getStoreCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    insertCgnExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.left(new Error("Entity Error")))
    );
    await pipe(
      TE.tryCatch(
        () => storeCgnExpirationActivityHandler(context, anActivityInput),
        toError
      ),
      TE.bimap(e => {
        expect(e).toBeDefined();
        expect(e.message).toContain("TRANSIENT FAILURE");
      }, testFail)
    )();
  });

  it("should return a permanent failure if any errors occurs on input decode", async () => {
    const storeCgnExpirationActivityHandler = getStoreCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );
    const response = await storeCgnExpirationActivityHandler(context, {});
    expect(response.kind).toBe("FAILURE");
  });

  it("should return success if a CgnExpiration's insert succeded", async () => {
    const storeCgnExpirationActivityHandler = getStoreCgnExpirationActivityHandler(
      tableServiceMock as any,
      expiredCgnTableName
    );

    insertCgnExpirationMock.mockImplementationOnce(_ =>
      jest.fn(() => TE.of({}))
    );
    const response = await storeCgnExpirationActivityHandler(
      context,
      anActivityInput
    );
    expect(response.kind).toBe("SUCCESS");
  });
});
