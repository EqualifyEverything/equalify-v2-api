import { chunk, db, isStaging, sleep, hashStringToUuid, normalizeHtmlWithVdom } from '#src/utils';

export const processScans = async (event) => {
    console.log(`Start processScans`);
    const startTime = new Date().getTime();
    await db.connect();
    const { userId, propertyId, discovery } = event;
    const jobIds = (await db.query({
        text: `
            SELECT s.job_id FROM scans as s 
            INNER JOIN properties AS p ON s.property_id = p.id 
            WHERE s.user_id=$1 AND s.property_id=$2 AND s.processing = TRUE AND p.discovery=$3
        `,
        values: [userId, propertyId, discovery],
    })).rows.map(obj => obj.job_id);
    const allNodeIds = [];
    const failedNodeIds = [];
    const pollScans = (givenJobIds) => new Promise(async (outerRes) => {
        await sleep(1000);
        const remainingScans = [];
        const batchesOfJobIds = chunk(givenJobIds, 25);
        for (const [index, batchOfJobIds] of batchesOfJobIds.entries()) {
            console.log(`Start ${index + 1} of ${batchesOfJobIds.length} batches`);
            await Promise.allSettled(batchOfJobIds.map(jobId => new Promise(async (innerRes) => {
                try {
                    const scanResults = await fetch(`https://scan${isStaging ? '-dev' : ''}.equalify.app/results/${jobId}`, { signal: AbortSignal.timeout(10000) });
                    const { result, status } = await scanResults.json();
                    if (['delayed', 'active', 'waiting'].includes(status)) {
                        remainingScans.push(jobId);
                    }
                    else if (['failed', 'unknown'].includes(status)) {
                        // It's failed/unknown, let's stop processing this scan
                        await db.query({
                            text: `UPDATE "scans" SET "processing"=FALSE, "error"=$1 WHERE "job_id"=$2`,
                            values: [true, jobId],
                        });
                        // Get the URL ID associated with this failed scan, and skip equalifying it!
                        const failedUrlId = (await db.query({
                            text: `SELECT "url_id" FROM "scans" WHERE "job_id"=$1`,
                            values: [jobId],
                        })).rows?.[0]?.url_id
                        if (failedUrlId) {
                            const failedNodeIdsToAdd = (await db.query({
                                text: `SELECT "id" FROM "enodes" WHERE "url_id"=$1`,
                                values: [failedUrlId],
                            })).rows.map(row => row.id);
                            failedNodeIds.push(...failedNodeIdsToAdd);
                        }
                    }
                    else if (['completed'].includes(status)) {
                        const nodeIds = await scanProcessor({ result, jobId, userId, propertyId });
                        allNodeIds.push(...nodeIds);
                    }
                }
                catch (err) {
                    console.log(err);
                    remainingScans.push(jobId);
                }
                innerRes(1);
            })));
            console.log(`End ${index + 1} of ${batchesOfJobIds.length} batches`);
        }
        const stats = { userId, remainingScans: remainingScans.length };
        console.log(JSON.stringify(stats));
        if (remainingScans.length > 0) {
            const currentTime = new Date().getTime();
            const deltaTime = currentTime - startTime;
            const tenMinutes = 10 * 60 * 1000;
            if (deltaTime <= tenMinutes) {
                await pollScans(remainingScans);
                outerRes(1);
            }
            else if (deltaTime > tenMinutes) {
                const scansExist = (await db.query({
                    text: `SELECT "id" FROM "scans" WHERE "job_id"=ANY($1) LIMIT 1`,
                    values: [jobIds],
                })).rows?.[0]?.id;
                if (scansExist) {
                    const message = `10 minutes reached, terminating processScans early`;
                    console.log(JSON.stringify({ message, ...stats }));
                    throw new Error(message);
                }
            }
        }
        outerRes(1);
    });
    console.log(`Start pollScans`);
    await pollScans(jobIds);
    console.log(`End pollScans`);

    console.log(`Start equalification`);
    // At the end of all scans, reconcile equalified nodes
    // Set node equalified to true for previous nodes associated w/ this scan (EXCEPT failed ones)
    const allPropertyUrlIds = (await db.query({
        text: `SELECT "id" FROM "urls" WHERE "user_id"=$1 AND "property_id"=$2`,
        values: [userId, propertyId],
    })).rows.map(obj => obj.id);
    const equalifiedNodeIds = (await db.query({
        text: `SELECT "id" FROM "enodes" WHERE "equalified"=$1 AND "user_id"=$2 AND "url_id"=ANY($3)`,
        values: [false, userId, allPropertyUrlIds],
    })).rows.map(obj => obj.id).filter(obj => ![...allNodeIds, ...failedNodeIds].map(obj => obj).includes(obj));

    console.log(JSON.stringify({ allPropertyUrlIds, equalifiedNodeIds, allNodeIds, failedNodeIds }));

    for (const equalifiedNodeId of equalifiedNodeIds) {
        const existingNodeUpdateId = (await db.query({
            text: `SELECT "id" FROM "enode_updates" WHERE "user_id"=$1 AND "enode_id"=$2 AND "created_at"::text LIKE $3`,
            values: [userId, equalifiedNodeId, `${new Date().toISOString().split('T')[0]}%`],
        })).rows[0]?.id;
        if (existingNodeUpdateId) {
            // We found an existing node update for today, let's simply update it
            await db.query({
                text: `UPDATE "enode_updates" SET "equalified"=$1 WHERE "id"=$2`,
                values: [true, existingNodeUpdateId],
            });
        }
        else {
            // No node update found, insert a new one!
            await db.query({
                text: `INSERT INTO "enode_updates" ("user_id", "enode_id", "equalified") VALUES ($1, $2, $3)`,
                values: [userId, equalifiedNodeId, true],
            });
        }
        // Now that we've inserted an "equalified" node update, let's set the parent node to "equalified" too!
        await db.query({
            text: `UPDATE "enodes" SET "equalified"=$1 WHERE "id"=$2`,
            values: [true, equalifiedNodeId],
        });
    }

    // For our failed nodes, we need to "copy" the last node update that exists (if there even is one!)
    for (const failedNodeId of failedNodeIds) {
        const existingNodeUpdateId = (await db.query({
            text: `SELECT "id" FROM "enode_updates" WHERE "user_id"=$1 AND "enode_id"=$2 AND "created_at"::text LIKE $3`,
            values: [userId, failedNodeId, `${new Date().toISOString().split('T')[0]}%`],
        })).rows[0]?.id;
        if (existingNodeUpdateId) {
            await db.query({
                text: `UPDATE "enode_updates" SET "equalified"=$1 WHERE "id"=$2`,
                values: [false, existingNodeUpdateId],
            });
        }
        else {
            // No node update found, insert a new one!
            await db.query({
                text: `INSERT INTO "enode_updates" ("user_id", "enode_id", "equalified") VALUES ($1, $2, $3)`,
                values: [userId, failedNodeId, false],
            });
        }
        // Now that we've inserted an "unequalified" node update, let's set the parent node to "unequalified" too!
        await db.query({
            text: `UPDATE "enodes" SET "equalified"=$1 WHERE "id"=$2`,
            values: [false, failedNodeId],
        });
    }

    console.log(`End equalification`);
    console.log(`End processScans`);

    await db.clean();
    return;
}

const scanProcessor = async ({ result, jobId, userId, propertyId }) => {
    // Find existing IDs for urls, messages, tags, & nodes (or create them)
    if (result.nodes.length > 0) {
        for (const row of result.urls) {
            row.id =
                (await db.query({
                    text: `SELECT "id" FROM "urls" WHERE "user_id"=$1 AND "url"=$2 AND "property_id"=$3`,
                    values: [userId, row.url, propertyId],
                })).rows?.[0]?.id
                ??
                (await db.query({
                    text: `INSERT INTO "urls" ("user_id", "url", "property_id") VALUES ($1, $2, $3) RETURNING "id"`,
                    values: [userId, row.url, propertyId]
                })).rows?.[0]?.id;
        }
        for (const row of result.nodes) {
            const normalizedHtml = normalizeHtmlWithVdom(row.html);
            const htmlHashId = hashStringToUuid(normalizedHtml);
            const existingId = (await db.query({
                text: `SELECT "id" FROM "enodes" WHERE "user_id"=$1 AND "html_hash_id"=$2 AND "url_id"=$3`,
                values: [userId, htmlHashId, result.urls.find(obj => obj.urlId === row.relatedUrlId)?.id],
            })).rows?.[0]?.id;

            row.id = existingId ??
                (await db.query({
                    text: `INSERT INTO "enodes" ("user_id", "targets", "html", "html_normalized", "html_hash_id", "url_id", "equalified") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING "id"`,
                    values: [userId, JSON.stringify(row.targets), row.html, normalizedHtml, htmlHashId, result.urls.find(obj => obj.urlId === row.relatedUrlId)?.id, false],
                })).rows?.[0]?.id;

            // We used to compare by targets as well, by something in the scan ocassionally returns different targets!!

            const existingNodeUpdateId = (await db.query({
                text: `SELECT "id" FROM "enode_updates" WHERE "user_id"=$1 AND "enode_id"=$2 AND "created_at"::text LIKE $3`,
                values: [userId, row.id, `${new Date().toISOString().split('T')[0]}%`],
            })).rows[0]?.id;
            if (existingNodeUpdateId) {
                await db.query({
                    text: `UPDATE "enode_updates" SET "equalified"=$1 WHERE "id"=$2`,
                    values: [false, existingNodeUpdateId],
                });
            }
            else {
                await db.query({
                    text: `INSERT INTO "enode_updates" ("user_id", "enode_id", "equalified") VALUES ($1, $2, $3)`,
                    values: [userId, row.id, false],
                });
            }

            if (existingId) {
                await db.query({
                    text: `UPDATE "enodes" SET "equalified"=$1 WHERE "id"=$2`,
                    values: [false, row.id],
                });
            }
        }
        for (const row of result.tags) {
            const tagId = hashStringToUuid(row.tag);
            row.id =
                (await db.query({
                    text: `SELECT "id" FROM "tags" WHERE "id"=$1`,
                    values: [tagId],
                })).rows?.[0]?.id
                ??
                (await db.query({
                    text: `INSERT INTO "tags" ("id", "tag") VALUES ($1, $2) RETURNING "id"`,
                    values: [tagId, row.tag],
                })).rows?.[0]?.id;
        }
        for (const row of result.messages) {
            const messageId = hashStringToUuid(row.message);
            const existingMessageId = (await db.query({
                text: `SELECT "id" FROM "messages" WHERE "id"=$1`,
                values: [messageId],
            })).rows?.[0]?.id;
            row.id = existingMessageId ??
                (await db.query({
                    text: `INSERT INTO "messages" ("id", "message", "type") VALUES ($1, $2, $3) RETURNING "id"`,
                    values: [messageId, row.message, row.type],
                })).rows?.[0]?.id;

            for (const relatedNodeId of row.relatedNodeIds) {
                try {
                    const messsageNodeExists = (await db.query({
                        text: `SELECT "id" FROM "message_nodes" WHERE "user_id"=$1 AND "message_id"=$2 AND "enode_id"=$3`,
                        values: [userId, row.id, result.nodes.find(obj => obj.nodeId === relatedNodeId)?.id],
                    })).rows?.[0]?.id;
                    if (!messsageNodeExists) {
                        await db.query({
                            text: `INSERT INTO "message_nodes" ("user_id", "message_id", "enode_id") VALUES ($1, $2, $3)`,
                            values: [userId, row.id, result.nodes.find(obj => obj.nodeId === relatedNodeId)?.id]
                        })
                    }
                }
                catch (err) {
                    console.log(err, `messageNode error`, JSON.stringify({ row }));
                }
            }

            if (!existingMessageId) {
                for (const relatedTagId of row.relatedTagIds) {
                    try {
                        await db.query({
                            text: `INSERT INTO "message_tags" ("message_id", "tag_id") VALUES ($1, $2)`,
                            values: [messageId, result.tags.find(obj => obj.tagId === relatedTagId)?.id]
                        });
                    }
                    catch (err) {
                        console.log(err, `messageTag error`, JSON.stringify({ row }));
                    }
                }
            }
        }
    }
    await db.query({
        text: `UPDATE "scans" SET "processing"=FALSE, "results"=$1 WHERE "job_id"=$2`,
        values: [result, jobId],
    });

    return result.nodes.map(obj => obj.id);
}