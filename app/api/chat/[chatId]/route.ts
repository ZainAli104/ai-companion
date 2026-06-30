import {NextResponse} from "next/server";
import {currentUser} from "@clerk/nextjs";
import {ChatOpenAI} from "@langchain/openai";
import {StreamingTextResponse} from "ai";

import prismadb from "@/lib/prismadb";
import {MemoryManager} from "@/lib/memory";
import {rateLimit} from "@/lib/rate-limit";

export async function POST(
    req: Request,
    {params}: { params: { chatId: string } }
) {
    try {
        const {prompt} = await req.json();
        const user = await currentUser();
        if (!user || !user.firstName || !user.id) {
            return new NextResponse("Unauthorized", {status: 401});
        }

        const identifier = req.url + '-' + user.id;
        const {success} = await rateLimit(identifier);
        if (!success) {
            return new NextResponse("Rate limit exceeded", {status: 429});
        }

        const companion = await prismadb.companion.update({
            where: {
                id: params.chatId
            },
            data: {
                messages: {
                    create: {
                        content: prompt,
                        role: "user",
                        userId: user.id
                    }
                }
            }
        });

        if (!companion) {
            return new NextResponse("Companion not found", {status: 404});
        }

        const name = companion.id;
        const companion_file_name = name + ".txt";

        const companionKey = {
            companionName: name,
            userId: user.id,
            modelName: "gpt-5-mini"
        };

        const memoryManager = await MemoryManager.getInstance();

        const records = await memoryManager.readLatestHistory(companionKey);

        if (records.length === 0) {
            await memoryManager.seedChatHistory(companion.seed, "\n\n", companionKey);
        }

        await memoryManager.writeToHistory("User: " + prompt + "\n", companionKey);

        const recentChatHistory = await memoryManager.readLatestHistory(companionKey);

        const similarDocs = await memoryManager.vectorSearch(
            recentChatHistory,
            companion_file_name
        );

        let relevantHistory = "";
        if (!!similarDocs && similarDocs.length !== 0) {
            relevantHistory = similarDocs.map((doc) => doc.pageContent).join("\n");
        }

        const model = new ChatOpenAI({
            model: "gpt-5-mini",
            apiKey: process.env.OPENAI_API_KEY,
        });

        model.verbose = true;

        const resp = String(
            (await model
                .invoke(`
                ONLY generate plain sentences without prefix of who is speaking. DO NOT use ${companion.name}: prefix.
                Direct start answering the user's question.

                ${companion.instructions}

                Below are the relevant details about ${companion.name}'s past and the conversation you are in.
                ${relevantHistory}

                ${recentChatHistory}\n${companion.name}:
            `)
                .catch(console.error))?.content ?? ""
        );

        const response = resp.trim();

        var Readable = require('stream').Readable;
        let s = new Readable();
        s.push(response);
        s.push(null);

        if (response !== undefined && response.length > 1) {
            await memoryManager.writeToHistory("" + response.trim(), companionKey);

            await prismadb.companion.update({
                where: {
                    id: params.chatId
                },
                data: {
                    messages: {
                        create: {
                            content: response.trim(),
                            role: "system",
                            userId: user.id
                        }
                    }
                }
            });
        }

        return new StreamingTextResponse(s);
    } catch (err) {
        console.log("[CHAT_POST]", err);
        return new NextResponse("Internal Server Error", {status: 500});
    }
}