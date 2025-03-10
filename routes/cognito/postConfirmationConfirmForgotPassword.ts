import { SES } from '@aws-sdk/client-ses';
import { event, formatEmail } from '#src/utils';
const ses = new SES({ region: 'us-east-1' });

export const postConfirmationConfirmForgotPassword = async () => {
    await ses.sendEmail({
        Destination: { ToAddresses: [event.request.userAttributes.email] },
        Message: {
            Body: {
                Html: { Data: formatEmail({ event, body: `<p>You've successfully changed your password! If you did not do this, we highly recommend changing your password immediately.</p><p><a href="https://${process.env.S3}/reset?email=${event.request.userAttributes.email}">Click this link to change your password again.</a><p>Otherwise, you can ignore this email.</p>` }) }
            },
            Subject: { Data: `You changed your password, ${event.request.userAttributes.name}` },
        },
        Source: `equalify <noreply@${process.env.URL}>`,
    });
    return event;
}