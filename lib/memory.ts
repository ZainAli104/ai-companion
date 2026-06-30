import {Redis} from "@upstash/redis";
import {OpenAIEmbeddings} from "@langchain/openai";
import {PineconeStore} from "@langchain/pinecone";
import {Pinecone} from "@pinecone-database/pinecone";

export type CompanionKey = {
    companionName: string;
    modelName: string;
    userId: string;
}

// Redis history is a cache in front of the permanent `Message` table in Postgres.
// Each companion's history key expires after this many seconds of inactivity to cap
// RAM usage. The TTL is refreshed on every write (sliding expiration), so active
// companions stay cached and idle ones are evicted automatically.
const HISTORY_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export class MemoryManager {
    private static instance: MemoryManager;
    private history: Redis;
    private vectorDBClient: Pinecone;

    public constructor() {
        this.history = Redis.fromEnv();
        this.vectorDBClient = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!
        });
    }

    public async vectorSearch(recentChatHistory: string, companionFileName: string) {
        const pineconeIndex = this.vectorDBClient.Index(process.env.PINECONE_INDEX! || "");

        const vectorStore = await PineconeStore.fromExistingIndex(
            new OpenAIEmbeddings({ openAIApiKey: process.env.OPENAI_API_KEY }),
            { pineconeIndex }
        );

        const similarDocs = await vectorStore
            .similaritySearch(recentChatHistory, 3, { fileName: companionFileName })
            .catch((err) => {
                console.log("WARNING: failed to get vector search results.", err);
            });

        return similarDocs;
    }

    public static async getInstance(): Promise<MemoryManager> {
        if (!MemoryManager.instance) {
            MemoryManager.instance = new MemoryManager();
        }
        return MemoryManager.instance;
    }

    private generateRedisCompanionKey(companionKey: CompanionKey) {
        return `${companionKey.companionName}-${companionKey.modelName}-${companionKey.userId}`;
    }

    public async writeToHistory(text: string, companionKey: CompanionKey) {
        if (!companionKey || typeof companionKey.userId == "undefined") {
            throw new Error("Invalid companion key");
        }

        const key = this.generateRedisCompanionKey(companionKey);
        const result = await this.history.zadd(key, {
            score: Date.now(),
            member: text
        });

        // Refresh the sliding 30-day expiry on every write so active chats stay
        // cached and idle ones are evicted to free RAM.
        await this.history.expire(key, HISTORY_TTL_SECONDS);

        return result;
    }

    public async readLatestHistory(companionKey: CompanionKey): Promise<string> {
        if (!companionKey || typeof companionKey.userId == "undefined") {
            throw new Error("Invalid companion key");
        }

        const key = this.generateRedisCompanionKey(companionKey);
        let result = await this.history.zrange(key, 0, Date.now(), {
            byScore: true
        });

        // result = result.slice(-30).reverse();
        // const recentChats = result.reverse().join("\n");
        const recentChats = result.slice(-30).reverse().join("\n");
        return recentChats;
    }

    public async seedChatHistory(
        seedContent: String,
        delimiter: string = "\n",
        companionKey: CompanionKey
    ) {
        const key = this.generateRedisCompanionKey(companionKey);
        if (await this.history.exists(key)) {
            console.log("User already has chat history");
            return;
        }

        const content = seedContent.split(delimiter);
        let counter = 0;
        for (const line of content) {
            await this.history.zadd(key, { score: counter, member: line });
            counter += 1;
        }

        // Apply the same 30-day expiry when the key is first seeded.
        await this.history.expire(key, HISTORY_TTL_SECONDS);
    }
}