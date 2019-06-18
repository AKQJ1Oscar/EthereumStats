# EthereumStats

# Scope

This is a project to track transactions in Ethereum's blockchain, generating an output graph with the corresponding wallets as nodes. Additionaly, you can apply a function to the original graph (like centrality) to get additional information. 

There are fixed paths in the code that should be changed/created to preserve the directory structure.

We use a local Geth client to access the public chain, accessing it through IPC. The IPC access mechanism can be easily modified to another one (like a REST API), although it can impact performance.

# Dependencies

* web3
* MongoDB
