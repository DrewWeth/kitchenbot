file = File.open("foods.db")
input = []
file.each_line do |line|
  # puts line.gsub(/[^0-9a-z ]/i, '').downcase.strip!
  input << line
end

input = input.uniq
input.each do |line|
  puts line
end
