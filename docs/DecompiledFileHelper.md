DecompiledFileHelper

A helper class that help us to determine whether a source file (a path or Uri) is a decompiled file and what assembly (dll) does it belong to.

Popular C# development extensions like C# Dev Kit and Dot Rush allow us to navigate to decompiled source files.

The core is the first line of the file, here is an example(popular extension have similiar first line):
``` csharp
#region Assembly Unity.InputSystem, Version=1.14.0.0, Culture=neutral, PublicKeyToken=null
```

We should use minimal information here, look for the `Assembly` keyword, after that is the name of the assembly and voila, we know this is a decompiled file and what assembly it comes from(by adding ".dll" to get the file name of the assembly).

