/* tslint:disable: no-any */
import { fromLeft, taskEither } from "fp-ts/lib/TaskEither";
import { FiscalCode } from "italia-ts-commons/lib/strings";
import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { context, mockStartNew } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import * as tableUtils from "../../utils/card_expiration";
import * as orchUtils from "../../utils/orchestrators";
import { getUpdateExpiredEycaHandler } from "../handler";

const activationAndExpirationDates = {
  activationDate: cgnActivatedDates.activation_date,
  expirationDate: cgnActivatedDates.expiration_date
};
// tslint:disable-next-line: readonly-array
const aSetOfExpiredRows: tableUtils.ExpiredCardRowKey[] = [
  {
    fiscalCode: "RODFDS82S10H501T" as FiscalCode,
    ...activationAndExpirationDates
  },
  {
    fiscalCode: "RODEDS80S10H501T" as FiscalCode,
    ...activationAndExpirationDates
  }
];
const tableServiceMock = jest.fn();
const expiredEycaTableName = "aTable" as NonEmptyString;

const getExpiredEycaUsersMock = jest.fn();
jest
  .spyOn(tableUtils, "getExpiredCardUsers")
  .mockImplementation(getExpiredEycaUsersMock);

const terminateOrchestratorMock = jest
  .fn()
  .mockImplementation(() => taskEither.of(void 0));
jest
  .spyOn(orchUtils, "terminateOrchestratorById")
  .mockImplementation(terminateOrchestratorMock);
describe("UpdateExpiredCgn", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should process all fiscalCodes present on table", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfExpiredRows)
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(mockStartNew).toBeCalledTimes(aSetOfExpiredRows.length);
  });

  it("should terminate other orchestrators running for activation", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfExpiredRows)
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(terminateOrchestratorMock).toBeCalledTimes(aSetOfExpiredRows.length);
  });

  it("should not instantiate any orchestrator if there are no elements to process", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() => taskEither.of([]));
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(mockStartNew).not.toHaveBeenCalled();
  });

  it("should not instantiate any orchestrator if there are errors querying table", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      fromLeft(new Error("Cannot query table"))
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(mockStartNew).not.toHaveBeenCalled();
  });
  it("should not instantiate some orchestrator if there are errors terminating other instances for a certain fiscalCode", async () => {
    getExpiredEycaUsersMock.mockImplementationOnce(() =>
      taskEither.of(aSetOfExpiredRows)
    );
    terminateOrchestratorMock.mockImplementationOnce(() =>
      fromLeft(new Error("Error"))
    );
    const updateExpiredEycaHandler = getUpdateExpiredEycaHandler(
      tableServiceMock as any,
      expiredEycaTableName
    );
    await updateExpiredEycaHandler(context);
    expect(mockStartNew).toBeCalledTimes(aSetOfExpiredRows.length - 1);
  });
});
