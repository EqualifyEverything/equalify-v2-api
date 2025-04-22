import { db, isStaging } from '#src/utils';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
const lambda = new LambdaClient();

export const runEveryFifteenMinutes = async () => {
    await db.connect();
    const pendingScans = (await db.query({
        text: `SELECT DISTINCT s.user_id, s.property_id, CONCAT(u.first_name,' ',u.last_name) AS user_name, u.email AS user_email, p.name AS property_name, COUNT(s.id) AS "pending_scans" FROM scans AS s 
            INNER JOIN users AS u ON u.id=s.user_id 
            INNER JOIN properties AS p ON p.id=s.property_id 
            WHERE s.processing = true 
            GROUP BY s.user_id, s.property_id, user_name, user_email, property_name
            ORDER BY pending_scans DESC`,
    })).rows;
    await db.clean();

    console.log(JSON.stringify({ pendingScans }));
    await fetch(process.env.SLACK_WEBHOOK, {
        method: 'POST',
        body: JSON.stringify({
            text: pendingScans.map(obj => `*${obj.user_name}* (${obj.user_email}) scan for *${obj.property_name}*: ${obj.pending_scans} scans left`).join('\n')
        })
    });

    for (const { user_id, property_id } of pendingScans) {
        lambda.send(new InvokeCommand({
            FunctionName: `equalify-api${isStaging ? '-staging' : ''}`,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({
                path: '/internal/processScans',
                userId: user_id,
                propertyId: property_id,
                discovery: 'sitemap',
            })),
        }));
    }
    return;
}