suppressMessages(library(igraph))

# Set working directory
setwd("/home/ether/EthereumTracking/TFM/R")

csv_graph <- read.csv("CSVfrom.csv", colClasses=c("character","character","numeric"))

g <- graph_from_data_frame(d=csv_graph, directed=FALSE)

result <- page_rank(g)

df <- data.frame(result)

write.csv(df, "result.csv")



