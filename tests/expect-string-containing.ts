declare global {
    namespace jest {
        interface Matchers<R> {
            toContainString(expected: string): CustomMatcherResult;
        }
    }
}

export const extendExpectWithContainString = () =>
    expect.extend({
        toContainString(received: any, expected: string) {
            return {
                pass: received.toString().includes(expected),
                message: () => `Received ${received} result doesn't contain ${expected}`
            }
        }
    });