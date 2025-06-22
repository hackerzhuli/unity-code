import * as assert from 'assert';
import { xmlToMarkdown } from '../../xmlToMarkdown.js';

/**
 * Test suite for xmlToMarkdown function using real C# XML documentation examples
 */

describe('xmlToMarkdown', () => {
    it('should convert empty or null input', () => {
        assert.strictEqual(xmlToMarkdown(''), '');
        assert.strictEqual(xmlToMarkdown('   '), '');
    });    it('should convert simple summary tag', () => {
        const input = `<summary>
Every class and member should have a one sentence
summary describing its purpose.
</summary>`;
        
        const expected = `## Summary

Every class and member should have a one sentence
summary describing its purpose.`;
        
        assert.strictEqual(xmlToMarkdown(input), expected);
    });

    it('should convert inline code elements', () => {
        const input = `In this case, the <c>ExampleClass</c> provides different C# elements`;
        const expected = `In this case, the \`ExampleClass\` provides different C# elements`;
        
        assert.strictEqual(xmlToMarkdown(input), expected);
    });

    it('should convert see cref elements', () => {
        const input = `The <see cref="Label"/> is a <see langword="string"/> that you use for a label.`;
        const expected = `The \`Label\` is a \`string\` that you use for a label.`;
        
        assert.strictEqual(xmlToMarkdown(input), expected);
    });

    it('should convert table-style lists', () => {
        const input = `<list type="table">
<item>
<term>Summary</term>
<description>
This should provide a one sentence summary of the class or member.
</description>
</item>
<item>
<term>Remarks</term>
<description>
This is typically a more detailed description of the class or member
</description>
</item>
</list>`;

        const result = xmlToMarkdown(input);
        assert.ok(result.includes('- **Summary**: This should provide a one sentence summary of the class or member.'));
        assert.ok(result.includes('- **Remarks**: This is typically a more detailed description of the class or member'));
    });

    it('should convert paragraphs', () => {
        const input = `<para>
The remarks can add multiple paragraphs, so you can
write detailed information for developers that use
your work.
</para>`;
        
        const result = xmlToMarkdown(input);
        assert.ok(result.includes('The remarks can add multiple paragraphs'));
    });    it('should convert parameter documentation', () => {
        const input = `<param name="left">
The left operand of the addition.
</param>
<param name="right">
The right operand of the addition.
</param>`;
        
        const result = xmlToMarkdown(input);
        // Parameters should be grouped into a "## Parameters" section with unordered list
        assert.ok(result.includes('## Parameters'));
        assert.ok(result.includes('- **`left`**: The left operand of the addition.'));
        assert.ok(result.includes('- **`right`**: The right operand of the addition.'));
    });

    it('should convert returns documentation', () => {
        const input = `<returns>
The sum of two integers.
</returns>`;
        
        const expected = `## Return Value\n\nThe sum of two integers.`;
        assert.strictEqual(xmlToMarkdown(input), expected);
    });

    it('should convert code blocks', () => {
        const input = `<example>
<code>
int c = Math.Add(4, 5);
if (c > 10)
{
    Console.WriteLine(c);
}
</code>
</example>`;
          const result = xmlToMarkdown(input);
        assert.ok(result.includes('## Example'));
        assert.ok(result.includes('```'));
        assert.ok(result.includes('int c = Math.Add(4, 5);'));
    });    it('should convert exception documentation', () => {
        const input = `<exception cref="System.OverflowException">
Thrown when one parameter is greater than MaxValue and the other is greater than 0.
</exception>`;
          const result = xmlToMarkdown(input);
        // Single exception now uses "## Exceptions" with list format 
        assert.ok(result.includes('## Exceptions'));
        assert.ok(result.includes('- **`System.OverflowException`**: Thrown when one parameter is greater than MaxValue'));
    });

    it('should convert value documentation', () => {
        const input = `<value>
The <c>Label</c> property represents a label
for this instance.
</value>`;
          const result = xmlToMarkdown(input);
        assert.ok(result.includes('## Value'));
        assert.ok(result.includes('The `Label` property represents a label'));
    });

    it('should convert see href links', () => {
        const input = `<see href="https://learn.microsoft.com/dotnet/api/system.int32.maxvalue"/>`;
        const expected = `[https://learn.microsoft.com/dotnet/api/system.int32.maxvalue](https://learn.microsoft.com/dotnet/api/system.int32.maxvalue)`;
        
        assert.strictEqual(xmlToMarkdown(input), expected);
    });

    it('should convert seealso references', () => {
        const input = `<seealso cref="ExampleClass.Label"/>`;
        const expected = `See also: \`ExampleClass.Label\``;
        
        assert.strictEqual(xmlToMarkdown(input), expected);
    });

    it('should convert line breaks', () => {
        const input = `Note: paragraphs are double spaced. Use the *br*<br/>tag for single spaced lines.`;
        const expected = `Note: paragraphs are double spaced. Use the *br*\ntag for single spaced lines.`;
        
        assert.strictEqual(xmlToMarkdown(input), expected);
    });

    it('should handle complex method documentation', () => {
        const input = `<summary>
Adds two integers and returns the result.
</summary>
<returns>
The sum of two integers.
</returns>
<param name="left">
The left operand of the addition.
</param>
<param name="right">
The right operand of the addition.
</param>
<exception cref="System.OverflowException">
Thrown when one parameter is
<see cref="Int32.MaxValue">MaxValue</see> and the other is
greater than 0.
</exception>`;        const result = xmlToMarkdown(input);
        assert.ok(result.includes('## Summary'));
        assert.ok(result.includes('Adds two integers and returns the result.'));
        // Returns should be "## Return Value" format
        assert.ok(result.includes('## Return Value'));
        assert.ok(result.includes('The sum of two integers.'));
        // Parameters should be grouped into "## Parameters" section
        assert.ok(result.includes('## Parameters'));
        assert.ok(result.includes('- **`left`**: The left operand of the addition.'));        assert.ok(result.includes('- **`right`**: The right operand of the addition.'));
        // Single exception now uses "## Exceptions" with list format
        assert.ok(result.includes('## Exceptions'));
        assert.ok(result.includes('- **`System.OverflowException`**: Thrown when one parameter is'));
        assert.ok(result.includes('`Int32.MaxValue`'));
    });

    it('should handle class-level documentation with remarks and lists', () => {
        const input = `<summary>
Every class and member should have a one sentence
summary describing its purpose.
</summary>
<remarks>
You can expand on that one sentence summary to
provide more information for readers. In this case,
the <c>ExampleClass</c> provides different C#
elements to show how you would add documentation
comments for most elements in a typical class.
<para>
The remarks can add multiple paragraphs, so you can
write detailed information for developers that use
your work.
</para>
<list type="table">
<item>
<term>Summary</term>
<description>
This should provide a one sentence summary of the class or member.
</description>
</item>
<item>
<term>Remarks</term>
<description>
This is typically a more detailed description of the class or member
</description>
</item>
</list>
</remarks>`;

        const result = xmlToMarkdown(input);        assert.ok(result.includes('## Summary'));
        assert.ok(result.includes('## Remarks'));
        assert.ok(result.includes('`ExampleClass`'));
        assert.ok(result.includes('- **Summary**: This should provide a one sentence summary'));
        assert.ok(result.includes('- **Remarks**: This is typically a more detailed description'));
    });

    it('should handle record documentation with param tags', () => {
        const input = `<summary>
This is an example of a positional record.
</summary>
<remarks>
There isn't a way to add XML comments for properties
created for positional records, yet.
</remarks>
<param name="FirstName">
This tag will apply to the primary constructor parameter.
</param>
<param name="LastName">
This tag will apply to the primary constructor parameter.
</param>`;        const result = xmlToMarkdown(input);
        assert.ok(result.includes('## Summary'));
        assert.ok(result.includes('This is an example of a positional record.'));        assert.ok(result.includes('## Remarks'));
        // Parameters should be grouped into "## Parameters" section
        assert.ok(result.includes('## Parameters'));
        assert.ok(result.includes('- **`FirstName`**: This tag will apply to the primary constructor parameter.'));
        assert.ok(result.includes('- **`LastName`**: This tag will apply to the primary constructor parameter.'));
    });

    // Comprehensive tests for grouping behavior
    describe('grouping behavior', () => {
        it('should group multiple consecutive parameters', () => {
            const input = `<param name="x">First parameter</param>
<param name="y">Second parameter</param>
<param name="z">Third parameter</param>`;
            
            const result = xmlToMarkdown(input);
            assert.ok(result.includes('## Parameters'));
            assert.ok(result.includes('- **`x`**: First parameter'));
            assert.ok(result.includes('- **`y`**: Second parameter'));
            assert.ok(result.includes('- **`z`**: Third parameter'));
        });        it('should use grouped format for single parameter', () => {
            const input = `<param name="value">Single parameter</param>`;
            
            const result = xmlToMarkdown(input);
            assert.ok(result.includes('## Parameters'));
            assert.ok(result.includes('- **`value`**: Single parameter'));
            assert.ok(!result.includes('## Parameter `value`'));
        });

        it('should group multiple consecutive exceptions', () => {
            const input = `<exception cref="ArgumentException">First exception</exception>
<exception cref="InvalidOperationException">Second exception</exception>`;
            
            const result = xmlToMarkdown(input);
            assert.ok(result.includes('## Exceptions'));
            assert.ok(result.includes('- **`ArgumentException`**: First exception'));
            assert.ok(result.includes('- **`InvalidOperationException`**: Second exception'));
        });        it('should use grouped format for single exception', () => {
            const input = `<exception cref="ArgumentException">Single exception</exception>`;
            
            const result = xmlToMarkdown(input);
            assert.ok(result.includes('## Exceptions'));
            assert.ok(result.includes('- **`ArgumentException`**: Single exception'));
            assert.ok(!result.includes('## Exception `ArgumentException`'));
        });it('should not group non-consecutive parameters', () => {
            const input = `<param name="x">First parameter</param>
<summary>A summary in between</summary>
<param name="y">Second parameter</param>`;
            
            const result = xmlToMarkdown(input);
            // Non-consecutive params each get their own "## Parameters" section
            assert.ok(result.includes('## Parameters'));
            assert.ok(result.includes('- **`x`**: First parameter'));
            assert.ok(result.includes('## Summary'));
            assert.ok(result.includes('- **`y`**: Second parameter'));
        });        it('should handle complex documentation with proper grouping', () => {
            const input = `<summary>A complex method</summary>
<param name="first">First param</param>
<param name="second">Second param</param>
<returns>The result</returns>
<exception cref="Exception1">First exception</exception>
<exception cref="Exception2">Second exception</exception>`;
            
            const result = xmlToMarkdown(input);
            assert.ok(result.includes('## Summary'));
            assert.ok(result.includes('## Parameters'));
            assert.ok(result.includes('- **`first`**: First param'));
            assert.ok(result.includes('- **`second`**: Second param'));
            assert.ok(result.includes('## Return Value'));
            assert.ok(result.includes('The result'));
            assert.ok(result.includes('## Exceptions'));
            assert.ok(result.includes('- **`Exception1`**: First exception'));
            assert.ok(result.includes('- **`Exception2`**: Second exception'));
        });
    });
});
