# Language Server Integration

This document describes how the Dot Rush language server handles C# symbols, which affects our hover provider implementation.

## Dot Rush Language Server Symbol Handling

### Namespace Handling
- Namespaces appear as symbols in the symbol tree
- Namespace symbols match exactly how they are written in code:
  - `namespace A.B.C {}` → One symbol for "A.B.C"
  - `namespace A { namespace B { namespace C {} } }` → Three separate symbols: "A", "B", "C"
- Symbol names include the full namespace path as written

### Type Information
- Type symbols appear under their namespace symbols in the hierarchy
- Symbol name contains the simple type name (not fully qualified)
- Detail field: Unknown/not documented yet

### Method Information
- Method names include parentheses and possibly parameter types
- Example: `MyMethod(string, int)` (exact format to be confirmed)

## Implementation Considerations

### Type Name Resolution Strategy

Build the fully qualified name by traversing the namespace hierarchy in the symbol tree.

### Symbol Analysis Approach

1. Traverse the namespace hierarchy to construct fully qualified type names
2. Handle nested namespace structures appropriately
3. Use the symbol tree structure to determine the complete namespace path

## Future Considerations

- Monitor for changes in Dot Rush language server behavior
- Document any additional symbol handling patterns discovered during testing
- Consider optimizations for namespace hierarchy traversal