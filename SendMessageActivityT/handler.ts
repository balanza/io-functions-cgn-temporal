import * as t from "io-ts";

import { MessageContent } from "@pagopa/io-functions-commons/dist/generated/definitions/MessageContent";
import { readableReport } from "@pagopa/ts-commons/lib/reporters";
import { FiscalCode } from "@pagopa/ts-commons/lib/strings";

import * as E from "fp-ts/lib/Either";
import { pipe } from "fp-ts/lib/function";
import {
  ActivityResult,
  ActivityResultFailure,
  success
} from "../utils/activity";
import { toHash } from "../utils/hash";
import {
  GetProfileT,
  makeNewMessage,
  SendMessageT
} from "../utils/notifications";

export const ActivityInput = t.interface({
  checkProfile: t.boolean,
  content: MessageContent,
  fiscalCode: FiscalCode
});
export type ActivityInput = t.TypeOf<typeof ActivityInput>;

export const getSendMessageActivityHandler = (
  getProfile: GetProfileT,
  sendMessage: SendMessageT,
  logPrefix: string = `SendMessageActivity`
  // eslint-disable-next-line sonarjs/cognitive-complexity
) => (input: ActivityInput): Promise<ActivityResult> => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const failure = (reason: string) => {
    console.error(reason);
    return ActivityResultFailure.encode({
      kind: "FAILURE",
      reason
    });
  };

  return pipe(
    input,
    ActivityInput.decode,
    E.fold(
      async errs =>
        failure(
          `${logPrefix}|Cannot decode input|ERROR=${readableReport(
            errs
          )}|INPUT=${JSON.stringify(input)}`
        ),
      async ({ content, fiscalCode, checkProfile }) => {
        const cfHash = toHash(fiscalCode);
        // throws in case of timeout so
        // the orchestrator can schedule a retry
        if (checkProfile) {
          const getProfileStatus = await getProfile(fiscalCode);

          if (getProfileStatus !== 200) {
            if (getProfileStatus === 404) {
              console.log(`${logPrefix}|CFHASH=${cfHash}|PROFILE_NOT_FOUND`);
              // In case the profile is not found continue
              return success();
            }
            const msg = `${logPrefix}|CFHASH=${cfHash}|ERROR=${getProfileStatus}`;
            if (getProfileStatus >= 500) {
              throw new Error(msg);
            } else {
              return failure(msg);
            }
          }
        }

        const sendMessageStatus = await sendMessage(
          fiscalCode,
          makeNewMessage(content)
        );

        if (sendMessageStatus !== 201) {
          const msg = `${logPrefix}|CFHASH=${cfHash}|ERROR=${sendMessageStatus}`;
          if (sendMessageStatus >= 500) {
            throw new Error(msg);
          } else {
            return failure(msg);
          }
        }

        console.log(
          `${logPrefix}|CFHASH=${cfHash}|RESPONSE=${sendMessageStatus}`
        );
        return success();
      }
    )
  );
};
