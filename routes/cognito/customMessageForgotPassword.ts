import { formatEmail, event, isStaging } from '#src/utils';

export const customMessageForgotPassword = async () => {
    event.response.emailSubject = `Reset your password, ${event.request.userAttributes['preferred_username']}`;
    event.response.emailMessage = formatEmail({ event, body: `<p>We received a request to reset your password.</p><p><a href="https://${isStaging ? 'staging.' : ''}${process.env.URL}/set?email=${event.request.userAttributes.email}&code=${event.request.codeParameter}">Click this link to set your new password.</a><p>If you did not request this, you can ignore this email.</p>` });

    return event;
}