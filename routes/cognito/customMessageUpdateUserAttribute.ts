import { formatEmail, event, isStaging } from '#src/utils';

export const customMessageUpdateUserAttribute = async () => {
    event.response.emailSubject = `Confirm your new email address, ${event.request.userAttributes['custom:username']}`;
    event.response.emailMessage = formatEmail({ event, body: `<p><a href="https://${isStaging ? 'staging.' : ''}${process.env.S3}/verify?username=${event.userName}&code=${event.request.codeParameter}">Click this link to confirm your new email address.</a></p>` });
    return event;
}