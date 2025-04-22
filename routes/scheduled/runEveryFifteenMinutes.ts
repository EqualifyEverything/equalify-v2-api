import { db, isStaging } from '#src/utils';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
const lambda = new LambdaClient();

export const runEveryFifteenMinutes = async () => {
    await db.connect();
    const pendingScans = (await db.query({
        text: `SELECT DISTINCT s.organization_id, s.audit_id, o.name AS organization_name, a.name AS audit_name, COUNT(s.id) AS "pending_scans" FROM scans AS s 
            INNER JOIN organizations AS o ON o.id=s.organization_id 
            INNER JOIN audits AS a ON a.id=s.audit_id 
            WHERE s.status = 'processing' 
            GROUP BY s.organization_id, s.audit_id, organization_name, audit_name
            ORDER BY pending_scans DESC`,
    })).rows;
    await db.clean();

    console.log(JSON.stringify({ pendingScans }));
    // await fetch(process.env.SLACK_WEBHOOK, {
    //     method: 'POST',
    //     body: JSON.stringify({
    //         text: pendingScans.map(obj => `*${obj.user_name}* (${obj.user_email}) scan for *${obj.audit_name}*: ${obj.pending_scans} scans left`).join('\n')
    //     })
    // });

    for (const { organization_id, audit_id } of pendingScans) {
        const response = await lambda.send(new InvokeCommand({
            FunctionName: `equalifyv2-api${isStaging ? '-staging' : ''}`,
            InvocationType: "Event",
            Payload: Buffer.from(JSON.stringify({
                path: '/internal/processScans',
                organization_id: organization_id,
                audit_id: audit_id,
                is_sitemap: true,
            })),
        }));
        console.log(JSON.stringify({ response }))
    }
    return;
}