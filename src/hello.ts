import { z } from "zod";

export const helloInputSchema = {
    name: z.string().min(1),
};

export function greet(name: string): string {
    return `Hello, ${name}!`;
}
