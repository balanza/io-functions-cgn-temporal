// eslint-disable sort-keys, @typescript-eslint/no-explicit-any

import { FiscalCode, NonEmptyString } from "@pagopa/ts-commons/lib/strings";
import { context as contextMock } from "../../__mocks__/durable-functions";
import { cgnActivatedDates } from "../../__mocks__/mock";
import {
  CardActivated,
  StatusEnum
} from "../../generated/definitions/CardActivated";
import {
  CardExpired,
  StatusEnum as ExpiredStatusEnum
} from "../../generated/definitions/CardExpired";
import {
  CardRevoked,
  StatusEnum as RevokedCgnStatusEnum
} from "../../generated/definitions/CardRevoked";
import { ActivityResult } from "../../utils/activity";
import { DEFAULT_EYCA_UPPER_BOUND_AGE } from "../../utils/config";
import { MESSAGES } from "../../utils/messages";
import { UpdateCgnOrchestratorHandler } from "../handler";

const aFiscalCode = "RODFDS82S10H501T" as FiscalCode;
const now = new Date();
const aReason = "aMotivation" as NonEmptyString;

const aUserCardRevoked: CardRevoked = {
  ...cgnActivatedDates,
  revocation_reason: aReason,
  revocation_date: now,
  status: RevokedCgnStatusEnum.REVOKED
};
const aUserCardActivated: CardActivated = {
  ...cgnActivatedDates,
  status: StatusEnum.ACTIVATED
};
const aUserCardExpired: CardExpired = {
  ...cgnActivatedDates,
  status: ExpiredStatusEnum.EXPIRED
};

const getInputMock = jest.fn();

const mockCallActivityWithRetry = jest.fn();

const contextMockWithDf = {
  ...contextMock,
  df: {
    callActivity: jest.fn(),
    callActivityWithRetry: mockCallActivityWithRetry,
    getInput: getInputMock,
    setCustomStatus: jest.fn(),
    // 4 CreateTimer
    createTimer: jest.fn().mockReturnValue("CreateTimer")
  }
};

const anUpdateCgnStatusResult: ActivityResult = {
  kind: "SUCCESS"
};

describe("UpdateCgnOrchestrator", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it("should send the right message on an activated CGN", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode,
      newStatusCard: aUserCardActivated
    }));
    mockCallActivityWithRetry
      // 1 UpsertSpecialServiceActivation
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 2 StoreCgnExpiration
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 3 UpdateCgnStatus
      .mockReturnValueOnce(anUpdateCgnStatusResult)
      // 4 UpsertSpecialServiceActivation
      .mockReturnValueOnce({ kind: "SUCCESS" })
      // 5 SendMessageActivity
      .mockReturnValueOnce("SendMessageActivity");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
    const orchestrator = UpdateCgnOrchestratorHandler(
      contextMockWithDf as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );

    // 1 UpsertSpecialServiceActivation
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // 2 StoreCgnExpiration
    const res2 = orchestrator.next(res1.value);
    expect(res2.value).toEqual({
      kind: "SUCCESS"
    });

    // 3 UpdateCgnStatus
    const res3 = orchestrator.next(res2.value);
    expect(res3.value).toEqual({ kind: "SUCCESS" });

    // 4 UpsertSpecialServiceActivation
    const res4 = orchestrator.next(res3.value);
    expect(res4.value).toEqual({
      kind: "SUCCESS"
    });

    // 5 CreateTimer
    const res5 = orchestrator.next(res4.value);
    expect(res5.value).toEqual("CreateTimer");

    // 6 SendMessage
    const res6 = orchestrator.next(res5.value);
    expect(res6.value).toEqual("SendMessageActivity");

    // Complete the orchestrator execution
    orchestrator.next();

    expect(
      contextMockWithDf.df.callActivityWithRetry.mock.calls[4][2].content
    ).toEqual(MESSAGES.CardActivated());
    expect(contextMockWithDf.df.createTimer).toHaveBeenCalledTimes(1);
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      2,
      "UPDATED"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      3,
      "COMPLETED"
    );
  });

  it("should send the right message on a revoked Cgn", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode,
      newStatusCard: aUserCardRevoked
    }));
    mockCallActivityWithRetry
      // 1 UpdateCgnStauts
      .mockReturnValueOnce(anUpdateCgnStatusResult)
      // 5 SendMessageActivity
      .mockReturnValueOnce("SendMessageActivity");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
    const orchestrator = UpdateCgnOrchestratorHandler(
      contextMockWithDf as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );

    // 1 UpdateCgnStauts
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // 2 CreateTimer
    const res2 = orchestrator.next(res1.value);
    expect(res2.value).toEqual("CreateTimer");

    // 3 SendMessageActivity
    const res3 = orchestrator.next(res2.value);
    expect(res3.value).toEqual("SendMessageActivity");

    // Complete the orchestrator execution
    orchestrator.next();

    expect(
      contextMockWithDf.df.callActivityWithRetry.mock.calls[1][2].content
    ).toEqual(MESSAGES.CardRevoked(aUserCardRevoked));

    expect(contextMockWithDf.df.createTimer).toHaveBeenCalledTimes(1);
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      2,
      "UPDATED"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      3,
      "COMPLETED"
    );
  });

  it("should send the right message on an expired Cgn", async () => {
    getInputMock.mockImplementationOnce(() => ({
      fiscalCode: aFiscalCode,
      newStatusCard: aUserCardExpired
    }));
    mockCallActivityWithRetry
      // 1 UpdateCgnStauts
      .mockReturnValueOnce(anUpdateCgnStatusResult)
      // 5 SendMessageActivity
      .mockReturnValueOnce("SendMessageActivity");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unnecessary-type-assertion
    const orchestrator = UpdateCgnOrchestratorHandler(
      contextMockWithDf as any,
      DEFAULT_EYCA_UPPER_BOUND_AGE
    );

    // 1 UpdateCgnStauts
    const res1 = orchestrator.next();
    expect(res1.value).toEqual({
      kind: "SUCCESS"
    });

    // 2 CreateTimer
    const res2 = orchestrator.next(res1.value);
    expect(res2.value).toEqual("CreateTimer");

    // 3 SendMessageActivity
    const res3 = orchestrator.next(res2.value);
    expect(res3.value).toEqual("SendMessageActivity");

    // Complete the orchestrator execution
    orchestrator.next();

    expect(
      contextMockWithDf.df.callActivityWithRetry.mock.calls[1][2].content
    ).toEqual(MESSAGES.CardExpired());

    expect(contextMockWithDf.df.createTimer).toHaveBeenCalledTimes(1);
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      1,
      "RUNNING"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      2,
      "UPDATED"
    );
    expect(contextMockWithDf.df.setCustomStatus).toHaveBeenNthCalledWith(
      3,
      "COMPLETED"
    );
  });
});
