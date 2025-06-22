# Language Server Integration

This document describes the differences between various language servers and how they handle C# symbols, which affects our hover provider implementation.

## Language Server Differences in Document Symbol Tree

### Dot Rush Language Server

#### Namespace Handling
- Namespaces appear as symbols in the symbol tree
- Namespace symbols match exactly how they are written in code:
  - `namespace A.B.C {}` → One symbol for "A.B.C"
  - `namespace A { namespace B { namespace C {} } }` → Three separate symbols: "A", "B", "C"
- Symbol names include the full namespace path as written

#### Type Information
- Type symbols appear under their namespace symbols in the hierarchy
- Symbol name contains the simple type name (not fully qualified)
- Detail field: Unknown/not documented yet

#### Method Information
- Method names include parentheses and possibly parameter types
- Example: `MyMethod(string, int)` (exact format to be confirmed)

### C# Dev Kit Language Server

#### Namespace Handling
- **No namespace symbols** in the symbol tree
- Types appear directly at the top level

#### Type Information
- Symbol name contains only the simple type name (e.g., "MyClass")
- **Detail field contains the fully qualified name** (e.g., "MyNamespace.MyClass")
- This is our primary source for fully qualified type names

#### Method Information
- Method names contain only the method name without parentheses or parameters
- Example: `MyMethod` (clean method name only)

## Implementation Considerations

### Type Name Resolution Strategy

1. **For C# Dev Kit**: Use the `detail` field as the primary source for fully qualified type names
2. **For Dot Rush**: Build the fully qualified name by traversing the namespace hierarchy in the symbol tree
3. **Fallback**: If detail field is available and contains a dot, prefer it over constructed names

### Detection Strategy

To determine which language server is being used:
- Check if namespace symbols exist in the symbol tree (Dot Rush)
- Check if type symbols have meaningful detail fields (C# Dev Kit)
- Use appropriate parsing strategy based on detection

### Symbol Analysis Approach

1. Always check the `detail` field first for fully qualified names
2. If detail field is empty or doesn't contain qualification, fall back to hierarchy-based construction
3. Handle both namespace-based (Dot Rush) and flat (C# Dev Kit) symbol structures

## Future Considerations

- Monitor for changes in language server behavior
- Consider adding configuration options for language server-specific handling
- Document any additional differences discovered during testing